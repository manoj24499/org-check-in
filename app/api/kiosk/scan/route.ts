import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPin, backfillPinLookupHash } from "@/lib/credentials";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget, resolveHomeTarget, resolveOfficeLocationTarget } from "@/lib/geofenceTarget";
import { getSettings } from "@/lib/settings";
import { resolveOrgBySlug } from "@/lib/organization";
import { requireMobileUser } from "@/lib/mobileAuth";
import { newTrackingToken } from "@/lib/trackingToken";
import { OFFLINE_FUTURE_SLACK_MS, OFFLINE_MAX_AGE_MS } from "@/lib/offlineCheckIn";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { verifyFace } from "@/lib/faceVerify";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { combineDateAndShiftEndTime, computeLateness } from "@/lib/shiftTime";
import { loadShiftAssignments, shiftForDate, type WeekdayShiftMap } from "@/lib/shiftAssignment";
import { startOfISTDay, endOfISTDay, todayDateOnlyIST, istDateKey, parseDateOnlyKey } from "@/lib/istTime";
import { findActiveCheckIn } from "@/lib/activeSession";

const scanSchema = z.object({
  // Which organization this kiosk belongs to — sent by app/kiosk/[orgSlug]
  // (or defaulted to "default" by the plain, org-less /kiosk route kept for
  // backward compatibility with already-bookmarked physical devices).
  orgSlug: z.string().min(1).default("default"),
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(10),
  action: z.enum(["CHECK_IN", "CHECK_OUT"]),
  photo: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Set by the client when the OS flags the reading as coming from a mock
  // location provider (Android only). Rejected outright wherever the
  // geofence would otherwise be enforced — see below.
  mocked: z.boolean().optional(),
  // Only meaningful on CHECK_IN, for FIELD or WFH-workMode employees — the
  // choice they made for today. "OFFICE" geofences the check-in against the
  // shared office location instead of the employee's usual target (no fixed
  // location for FIELD, home for WFH). Omitted preserves each profile's
  // default (FIELD stays ungeofenced, WFH stays geofenced against home).
  // HYBRID employees: optional — "OFFICE" or "HOME" checks only that place;
  // omitted, they're accepted inside either one (office tried first) and the
  // day starts with whichever they are in. "HOME" is HYBRID-only.
  checkInMode: z.enum(["OFFICE", "FIELD", "HOME"]).optional(),
  // Only meaningful on CHECK_OUT, and only when the employee has an active
  // OvertimeRequest for today (see /api/mobile/me/overtime) — optional even
  // then, never required to actually check out (see the schema comment on
  // OvertimeRequest.workSummary).
  overtimeSummary: z.string().trim().max(1000).optional(),
  overtimeSummaryPhoto: z.string().optional(),
  // Vehicle odometer reading in km — the start reading on CHECK_IN, the end
  // reading on CHECK_OUT. Sent by the mobile app for Field-mode sessions.
  odometerKm: z.number().min(0).max(10_000_000).optional(),
  // Present only when the mobile app saved this check-in/out while offline and is sending it later.
  // `capturedAt` is the phone's clock at the moment of the action; `timeVerified` says whether the
  // phone could prove its clock was untouched since its last contact with the server. `clientId` makes a
  // retry idempotent. Requires the employee's own bearer token and the organization's offline setting.
  offline: z
    .object({
      clientId: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
      capturedAt: z.string().datetime({ offset: true }),
      timeVerified: z.boolean(),
    })
    .optional(),
});

/**
 * Auto-closes any earlier day's check-in the employee simply forgot to
 * check out of. Nothing else in this app ever does this on its own — there's
 * no midnight sweep — so a forgotten check-in otherwise stays open forever:
 * every hours calculation for that day requires a real checkout to compute
 * anything (see lib/attendanceHours.ts and the mobile app's identical
 * attendanceGrouping.ts), so it silently shows blank/zero, and the weekly
 * total does too if enough days are affected. Runs right before a new
 * CHECK_IN and sweeps the *entire* backlog in one pass, not just the
 * immediately preceding day, so it also repairs however many days have
 * already piled up. The auto-checkout time is the employee's shift end *for
 * that check-in's own weekday* if they had one assigned (same precedent as
 * the Timed Permission auto-checkout in /api/kiosk/location) — resolved per
 * iteration since a backlog can span several different weekdays — otherwise
 * the end of that day.
 */
async function autoCloseStaleCheckIns(user: { id: string }, shiftMap: WeekdayShiftMap, before: Date) {
  // No photo bytes needed to compute an auto-checkout time — see the
  // egress-audit note on the todaysRecords query below.
  const staleCheckIns = await prisma.attendance.findMany({
    where: { userId: user.id, type: "CHECK_IN", timestamp: { lt: before } },
    orderBy: { timestamp: "asc" },
    select: { id: true, timestamp: true },
  });

  for (const checkIn of staleCheckIns) {
    const dayEnd = endOfISTDay(checkIn.timestamp);

    const hasCheckOutThatDay = await prisma.attendance.findFirst({
      where: { userId: user.id, type: "CHECK_OUT", timestamp: { gt: checkIn.timestamp, lte: dayEnd } },
      select: { id: true },
    });
    if (hasCheckOutThatDay) continue;

    const shiftThatDay = shiftForDate(shiftMap, checkIn.timestamp);
    const shiftEnd = shiftThatDay ? combineDateAndShiftEndTime(checkIn.timestamp, shiftThatDay) : null;
    const checkoutAt = shiftEnd && shiftEnd > checkIn.timestamp ? shiftEnd : dayEnd;

    try {
      await prisma.$transaction([
        prisma.attendance.create({
          data: {
            userId: user.id,
            type: "CHECK_OUT",
            method: "AUTO",
            timestamp: checkoutAt,
            // The session's own day, not the day the (possibly after-midnight) check-out falls on.
            dayKey: istDateKey(checkIn.timestamp),
          },
        }),
        prisma.attendancePause.updateMany({
          where: { attendanceId: checkIn.id, resumedAt: null },
          data: { resumedAt: checkoutAt },
        }),
        prisma.attendance.update({ where: { id: checkIn.id }, data: { pauseWarningAt: null } }),
        prisma.workSegment.updateMany({
          where: { attendanceId: checkIn.id, endedAt: null },
          data: { endedAt: checkoutAt },
        }),
        // Mirror the manual-checkout path below: a stale check-in can still
        // have an active (unsubmitted) overtime request hanging off it — if
        // this auto-close doesn't resolve it too, it's stuck showing "Still
        // working" forever (see /admin/overtime), since nothing else ever
        // sets submittedAt for it. No summary/photo to attach here, same as
        // any other checkout where the employee didn't provide one.
        prisma.overtimeRequest.updateMany({
          where: { attendanceId: checkIn.id, submittedAt: null },
          data: { submittedAt: checkoutAt },
        }),
      ]);
    } catch (err) {
      // A (userId, type, dayKey) collision here means something else already
      // occupies this exact day's CHECK_OUT slot — seen in practice from
      // pre-fix data (a mistimed auto-checkout computed under the old,
      // pre-IST shift-time bug landed on the wrong dayKey and never got
      // cleaned up). Skip this one stale check-in rather than failing the
      // whole request — better to leave one old record unclosed than to
      // block the employee's real check-in today over historical debris.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        console.error(
          `[autoCloseStaleCheckIns] Skipped stale check-in ${checkIn.id} for user ${user.id}: dayKey collision.`,
        );
        continue;
      }
      throw err;
    }
  }
}

const PHOTO_RETENTION_DAYS = 45;
// A base64-encoded MAX_PHOTO_BYTES photo inflates to ~4/3 of its raw size —
// this caps the raw *request* body (checked before it's ever parsed as
// JSON), so it needs enough headroom above MAX_PHOTO_BYTES for that base64
// overhead plus the other small JSON fields, not just the decoded photo cap.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/**
 * Best-effort cleanup: clear photo bytes (and the hasPhoto flag) once
 * they're past retention — both for check-in/out presence photos and for
 * FieldVisit's manually-logged site photos (same retention window; see its
 * schema comment). This runs on essentially every check-in/out anywhere in
 * the app (kiosk, mobile — see the README's "Mobile app" section on why
 * they share this route), which is what makes running it here, rather than
 * a dedicated cron job, an adequate sweep.
 */
async function expireOldPhotos() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PHOTO_RETENTION_DAYS);
  try {
    await prisma.attendance.updateMany({
      where: { hasPhoto: true, timestamp: { lt: cutoff } },
      data: { photo: null, hasPhoto: false },
    });
    await prisma.fieldVisit.updateMany({
      where: { hasPhoto: true, reachedAt: { lt: cutoff } },
      data: { photo: null, hasPhoto: false },
    });
    // Photos kept with refused face checks follow the same retention. Last, so a missing table (migration
    // not applied yet) can't stop the cleanups above.
    await prisma.checkInAttempt.updateMany({
      where: { hasPhoto: true, createdAt: { lt: cutoff } },
      data: { photo: null, hasPhoto: false },
    });
  } catch {
    // Cleanup is opportunistic — never let it block a real check-in.
  }
}

// This route previously had no top-level catch at all — an unexpected
// failure (e.g. the DB being briefly unreachable, per the 2026-09-03
// incident) bubbled all the way up to a bare 500 with no body, which is
// both a bad experience for whoever's standing at the kiosk and much
// harder to diagnose than it needs to be. Logging server-side and
// returning a clean JSON error (never the real error detail, matching
// every other route's error handling in this app) fixes both.
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ctx: AttemptContext = {};
  let res: NextResponse;
  try {
    res = await handlePost(req, ctx);
  } catch (err) {
    console.error("[POST /api/kiosk/scan] Unhandled error:", err);
    res = NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
  // After the response is decided and never awaited: the log can't slow down or change the answer.
  void recordAttempt(req, res, ctx, startedAt);
  return res;
}

/** What the handler learned along the way, for the attempt log (never the PIN or the photo). */
interface AttemptContext {
  rawEmployeeCode?: string;
  body?: {
    employeeCode: string;
    action: "CHECK_IN" | "CHECK_OUT";
    latitude?: number;
    longitude?: number;
    mocked?: boolean;
    checkInMode?: string;
    offline: boolean;
  };
  organizationId?: string;
  userId?: string;
  viaMobile?: boolean;
  faceVerifyStatus?: "NOT_CHECKED" | "MATCHED" | "MISMATCH" | "UNAVAILABLE";
  faceSimilarity?: number | null;
  /** The photo that failed face verification — saved with the attempt, for that one case only. */
  failedFacePhoto?: Uint8Array<ArrayBuffer>;
}

// The table only exists once its migration has been applied. If it's missing, stop trying for a while
// instead of failing (and logging an error) on every single check-in.
let attemptLogPausedUntil = 0;

function reasonCodeFor(status: number, message: string | null, code: string | null, ctx: AttemptContext): string | null {
  if (status >= 200 && status < 300) return null;
  const m = message ?? "";
  if (status >= 500) return "SERVER_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (ctx.faceVerifyStatus === "MISMATCH") return "FACE_MISMATCH";
  if (code && code.startsWith("OFFLINE_")) return code;
  if (/not recognized/i.test(m)) return "INVALID_PIN";
  if (/mock location/i.test(m)) return "MOCK_LOCATION";
  if (/outside/i.test(m)) return "OUTSIDE_AREA";
  if (/location permission/i.test(m)) return "LOCATION_REQUIRED";
  if (/already checked in/i.test(m)) return "ALREADY_CHECKED_IN";
  if (/already checked out/i.test(m)) return "ALREADY_CHECKED_OUT";
  if (/check in before/i.test(m)) return "NOT_CHECKED_IN";
  if (/approved leave/i.test(m)) return "ON_LEAVE";
  if (/photo is required/i.test(m)) return "PHOTO_REQUIRED";
  if (/photo/i.test(m)) return "INVALID_PHOTO";
  if (/odometer/i.test(m)) return "ODOMETER";
  if (/organization/i.test(m) || /kiosk/i.test(m)) return "ORGANIZATION";
  if (/invalid request|too large/i.test(m)) return "INVALID_REQUEST";
  return "OTHER";
}

async function recordAttempt(req: NextRequest, res: NextResponse, ctx: AttemptContext, startedAt: number) {
  try {
    if (Date.now() < attemptLogPausedUntil) return;
    // Cloned first, synchronously, before the framework starts sending the original body.
    const clone = res.clone();
    const body = (await clone.json().catch(() => null)) as {
      id?: string;
      error?: string;
      code?: string;
      idempotentReplay?: boolean;
    } | null;
    const status = res.status;
    const ok = status >= 200 && status < 300;
    const message = typeof body?.error === "string" ? body.error : null;
    const employeeCode = ctx.body?.employeeCode ?? ctx.rawEmployeeCode;
    // Nothing identifying the caller (an unreadable body): not worth a row.
    if (!employeeCode) return;

    const reasonCode = ok
      ? body?.idempotentReplay
        ? "REPLAY"
        : null
      : reasonCodeFor(status, message, body?.code ?? null, ctx);
    const keepPhoto = reasonCode === "FACE_MISMATCH" && ctx.failedFacePhoto ? ctx.failedFacePhoto : null;

    await prisma.checkInAttempt.create({
      data: {
        organizationId: ctx.organizationId ?? null,
        userId: ctx.userId ?? null,
        employeeCode: employeeCode.slice(0, 64),
        action: ctx.body?.action ?? "UNKNOWN",
        outcome: ok ? "SUCCESS" : status >= 500 ? "ERROR" : "REJECTED",
        reasonCode,
        reason: message ? message.slice(0, 500) : null,
        httpStatus: status,
        source: ctx.viaMobile ? "MOBILE" : "KIOSK",
        offline: ctx.body?.offline ?? false,
        ipAddress: getClientIp(req).slice(0, 64),
        userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        latitude: ctx.body?.latitude ?? null,
        longitude: ctx.body?.longitude ?? null,
        mocked: ctx.body?.mocked ?? null,
        checkInMode: ctx.body?.checkInMode ?? null,
        faceVerifyStatus: ctx.faceVerifyStatus ?? "NOT_CHECKED",
        faceSimilarity: ctx.faceSimilarity ?? null,
        ...(keepPhoto ? { photo: keepPhoto, hasPhoto: true } : {}),
        attendanceId: ok && body?.id ? body.id : null,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022")) {
      attemptLogPausedUntil = Date.now() + 10 * 60_000;
      console.warn("[scan] CheckInAttempt table not found — attempt logging paused. Apply the pending migration.");
      return;
    }
    console.error("[scan] Could not write the attempt log:", err instanceof Error ? err.message : err);
  }
}

async function handlePost(req: NextRequest, ctx: AttemptContext) {
  const ip = getClientIp(req);
  if (await isRateLimited(`scan:${ip}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (json && typeof json === "object" && typeof (json as { employeeCode?: unknown }).employeeCode === "string") {
    ctx.rawEmployeeCode = (json as { employeeCode: string }).employeeCode;
  }
  const parsed = scanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  ctx.body = {
    employeeCode: parsed.data.employeeCode,
    action: parsed.data.action,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    mocked: parsed.data.mocked,
    checkInMode: parsed.data.checkInMode,
    offline: Boolean(parsed.data.offline),
  };

  // Resolves which organization this kiosk belongs to, from the slug in its
  // own URL (see app/kiosk/[orgSlug]/page.tsx) — everything else below is
  // scoped to it.
  // An authenticated mobile-app caller is scoped by its own bearer token: the
  // app never sends an orgSlug, so without this every non-"default" org's
  // employees would be looked up in the default org and rejected. Anonymous
  // (kiosk) callers still resolve from the slug in their URL.
  const mobileAuth = await requireMobileUser(req);
  const org = mobileAuth
    ? await prisma.organization.findUnique({ where: { id: mobileAuth.organizationId }, select: { id: true, status: true } })
    : await resolveOrgBySlug(parsed.data.orgSlug);
  ctx.viaMobile = Boolean(mobileAuth);
  if (org) ctx.organizationId = org.id;
  if (!org) {
    return NextResponse.json({ error: "This kiosk isn't linked to an organization." }, { status: 401 });
  }
  if (org.status === "SUSPENDED") {
    return NextResponse.json({ error: "This organization is currently disabled." }, { status: 403 });
  }

  // The IP-based limit above only slows a single-source attacker — a kiosk
  // is shared by every employee behind one office IP, so it can't be tuned
  // tight enough to also block someone who spreads guesses across many
  // IPs/proxies (or switches to the mobile app or web login to get a fresh
  // budget) without breaking legitimate shared-kiosk use. isPinGuessLimited
  // is shared across every PIN-checking surface, keyed on organizationId +
  // employeeCode, so guesses against one account are capped regardless of
  // source IP or entry point. Checked before any photo decoding — no reason
  // to make an attacker do that work first.
  if (await isPinGuessLimited(org.id, parsed.data.employeeCode)) {
    return NextResponse.json(
      { error: "Too many attempts for this employee code. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  await expireOldPhotos();

  // Independent of each other (both only need org.id) — run concurrently
  // rather than as two sequential round-trips.
  const [candidate, settings] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId: org.id, employeeCode: parsed.data.employeeCode } }),
    getSettings(org.id),
  ]);

  // A presence photo is always mandatory for check-in; for check-out it
  // depends on the admin-configured setting. Only the cheap presence check
  // happens here — actually decoding it (sharp resize/re-encode of up to
  // ~5.3MB) waits until after credentials are verified below, so a caller
  // with no valid employee code/PIN can never force that work. Without
  // this ordering, isPinGuessLimited above doesn't help: it's keyed by
  // employeeCode, so an attacker supplying a fresh/nonexistent code on every
  // request always passes it, then this used to decode a full photo before
  // ever checking whether the credentials were even plausible.
  const photoRequired =
    parsed.data.action === "CHECK_IN" ||
    (parsed.data.action === "CHECK_OUT" && settings.checkOutPhotoRequired);

  if (photoRequired && !parsed.data.photo) {
    const verb = parsed.data.action === "CHECK_IN" ? "check in" : "check out";
    return NextResponse.json({ error: `A photo is required to ${verb}.` }, { status: 400 });
  }

  const user =
    candidate?.pinHash && (await verifyPin(parsed.data.pin, candidate.pinHash)) ? candidate : null;

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your employee code and PIN and try again." },
      { status: 401 }
    );
  }
  ctx.userId = user.id;
  if (!user.pinLookupHash && user.organizationId) {
    backfillPinLookupHash(user.id, user.organizationId, parsed.data.pin);
  }

  // Offline (saved on the phone, sent later). Only the employee's own signed-in app may send one, the
  // organization must allow it, and the capture time has to be believable. The time of the action
  // is then the capture time, not now.
  const offline = parsed.data.offline;
  let eventTime = new Date();
  if (offline) {
    if (!mobileAuth || mobileAuth.sub !== user.id) {
      return NextResponse.json(
        { error: "Offline check-ins can only be sent from your own signed-in app.", code: "OFFLINE_AUTH" },
        { status: 403 },
      );
    }
    if (!settings.offlineCheckInEnabled) {
      return NextResponse.json(
        { error: "Offline check-in isn't enabled for your organization.", code: "OFFLINE_DISABLED" },
        { status: 403 },
      );
    }
    // The same attempt sent twice (a reply was lost) returns what was already recorded.
    const replay = await prisma.attendance.findUnique({
      where: { clientId: offline.clientId },
      select: { id: true, userId: true, type: true, timestamp: true, lateMinutes: true, leaveType: true, checkInMode: true, offlineOutsideArea: true },
    });
    if (replay) {
      if (replay.userId !== user.id) {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }
      return NextResponse.json({
        id: replay.id,
        name: user.name,
        employeeCode: user.employeeCode,
        type: replay.type,
        timestamp: replay.timestamp,
        lateMinutes: replay.lateMinutes,
        leaveType: replay.leaveType,
        checkInMode: replay.checkInMode,
        workMode: user.workMode,
        recordedOffline: true,
        offlineOutsideArea: replay.offlineOutsideArea,
        idempotentReplay: true,
      });
    }
    const captured = new Date(offline.capturedAt);
    if (Number.isNaN(captured.getTime()) || captured.getTime() > Date.now() + OFFLINE_FUTURE_SLACK_MS) {
      return NextResponse.json(
        { error: "The time on this check-in is in the future. Check your phone's date and time.", code: "OFFLINE_FUTURE" },
        { status: 400 },
      );
    }
    if (Date.now() - captured.getTime() > OFFLINE_MAX_AGE_MS) {
      return NextResponse.json(
        {
          error: "This check-in is too old to send automatically. Ask your admin to add it manually.",
          code: "OFFLINE_TOO_OLD",
        },
        { status: 422 },
      );
    }
    eventTime = captured;
  }

  let photoBuffer: Uint8Array<ArrayBuffer> | null = null;
  if (photoRequired) {
    // parsed.data.photo's presence was already checked above; TypeScript
    // doesn't know that check still holds after the credential branch, so
    // this repeats it narrowly just to satisfy the type.
    photoBuffer = parsed.data.photo ? await decodePhoto(parsed.data.photo) : null;
    if (!photoBuffer) {
      return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
    }
    if (photoBuffer.length > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
    }
  }

  // Face verification only runs for employees an admin has explicitly
  // enabled it for (i.e. whose reference photo has actually been enrolled
  // on the face-verification server — see lib/faceVerify.ts). A mismatch
  // blocks the check-in outright; the service being unreachable fails open
  // (recorded as UNAVAILABLE, not silently treated as a real match) so a
  // network hiccup on that server never locks the whole office out.
  let faceVerifyStatus: "NOT_CHECKED" | "MATCHED" | "MISMATCH" | "UNAVAILABLE" = "NOT_CHECKED";
  let faceSimilarity: number | null = null;

  if (user.faceVerificationEnabled && photoBuffer) {
    const result = await verifyFace(org.id, user.employeeCode, photoBuffer);
    if (result.outcome === "matched") {
      faceVerifyStatus = "MATCHED";
      faceSimilarity = result.similarity;
    } else if (result.outcome === "mismatch") {
      faceVerifyStatus = "MISMATCH";
      faceSimilarity = result.similarity;
      ctx.faceVerifyStatus = faceVerifyStatus;
      ctx.faceSimilarity = faceSimilarity;
      ctx.failedFacePhoto = photoBuffer;
      return NextResponse.json({ error: result.message }, { status: 401 });
    } else {
      faceVerifyStatus = "UNAVAILABLE";
    }
  }
  ctx.faceVerifyStatus = faceVerifyStatus;
  ctx.faceSimilarity = faceSimilarity;

  // Loaded once and reused below — an employee can be on a different shift
  // on different weekdays (see lib/shiftAssignment.ts).
  const shiftMap = await loadShiftAssignments(user.id);

  // Sweep up any forgotten check-in from a previous day before doing
  // anything else — see autoCloseStaleCheckIns for why this can't wait.
  if (parsed.data.action === "CHECK_IN") {
    await autoCloseStaleCheckIns(user, shiftMap, startOfISTDay(eventTime));
  }

  // An approved leave day blocks check-in outright — being on paid leave and
  // still checking in for work is a contradiction the system shouldn't
  // silently allow (see /api/mobile/me/leave-requests). Check-out is left
  // alone: if someone's already checked in (e.g. leave was approved after
  // the fact), they still need a way to close out their day normally.
  if (parsed.data.action === "CHECK_IN") {
    // TimeOffRequest.startDate/endDate are date-only fields (UTC midnight of
    // the picked calendar date — see lib/istTime.ts), so this needs that
    // same date-only encoding of "today", not a real IST-midnight instant.
    const today = offline ? (parseDateOnlyKey(istDateKey(eventTime)) ?? todayDateOnlyIST()) : todayDateOnlyIST();
    const onApprovedLeaveToday = await prisma.timeOffRequest.findFirst({
      where: { userId: user.id, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
    });
    if (onApprovedLeaveToday) {
      return NextResponse.json(
        { error: "You have approved leave today — check-in is disabled." },
        { status: 409 },
      );
    }
  }

  // A FIELD or WFH-workMode employee picks their mode for the day at
  // check-in — if they chose "Office", they're geofenced against the shared
  // office location exactly like a regular OFFICE employee (covers a WFH
  // employee coming in for the day, who'd otherwise be geofenced against
  // their home address and rejected); otherwise (the default) FIELD stays
  // ungeofenced and WFH stays geofenced against home, same as before this
  // choice existed.
  const effectiveWorkMode: typeof user.workMode =
    user.workMode === "FIELD"
      ? parsed.data.checkInMode === "OFFICE"
        ? "OFFICE"
        : "FIELD"
      : user.workMode === "WFH"
        ? parsed.data.checkInMode === "OFFICE"
          ? "OFFICE"
          : "WFH"
        : user.workMode;

  // Set for an offline upload whose saved location was outside the allowed radius: accepted anyway,
  // flagged for the admin to review (the employee already left the signal-free spot long ago).
  let offlineOutsideArea = false;

  // HYBRID: where the day starts (OFFICE or HOME) — becomes checkInMode and
  // the first WorkSegment. Decided by the geofence gate below.
  let hybridPlace: "OFFICE" | "HOME" | null = null;

  if (parsed.data.action === "CHECK_IN" && user.workMode === "HYBRID") {
    if (parsed.data.checkInMode === "FIELD") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (parsed.data.mocked) {
      return NextResponse.json(
        { error: "Mock location detected. Please disable mock/fake GPS apps and try again." },
        { status: 409 },
      );
    }
    const requested = parsed.data.checkInMode as "OFFICE" | "HOME" | undefined;
    const [officeTarget, homeTarget] = await Promise.all([
      requested === "HOME" || !user.organizationId ? null : resolveOfficeLocationTarget(user.organizationId),
      requested === "OFFICE" ? null : resolveHomeTarget(user),
    ]);
    // Office first, so someone whose home is near the office starts as OFFICE.
    const places = [
      ...(officeTarget ? [{ place: "OFFICE" as const, target: officeTarget }] : []),
      ...(homeTarget ? [{ place: "HOME" as const, target: homeTarget }] : []),
    ];
    if (places.length === 0) {
      // Nothing configured (same "not enforced" precedent as every other mode).
      hybridPlace = requested ?? "OFFICE";
    } else {
      if (parsed.data.latitude === undefined || parsed.data.longitude === undefined) {
        return NextResponse.json({ error: "Location permission is required to check in." }, { status: 400 });
      }
      const lat = parsed.data.latitude;
      const lng = parsed.data.longitude;
      // How far outside each radius (negative = inside).
      const measured = places.map((p) => ({
        ...p,
        overshoot: haversineDistanceMeters(lat, lng, p.target.latitude, p.target.longitude) - p.target.radiusMeters,
      }));
      const inside = measured.find((m) => m.overshoot <= 0);
      if (inside) {
        hybridPlace = inside.place;
      } else if (offline) {
        // Accepted and flagged, like every other offline upload outside its area; the day starts at
        // whichever place they were nearest to.
        offlineOutsideArea = true;
        hybridPlace = measured.reduce((a, b) => (b.overshoot < a.overshoot ? b : a)).place;
      } else {
        const message =
          requested === "HOME"
            ? "You are outside your home work location."
            : requested === "OFFICE"
              ? `You are outside the permitted office area. Please move within ${Math.round(
                  officeTarget?.radiusMeters ?? 0,
                )} meters of the office to check in.`
              : "You are outside both the office and your home work location. Please check in from the office or from home.";
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }
  }

  // Geofence the check-in against whichever location applies to this
  // employee. No location configured yet (office or home) == not enforced.
  // (HYBRID was handled just above.)
  if (parsed.data.action === "CHECK_IN" && effectiveWorkMode !== "FIELD" && user.workMode !== "HYBRID") {
    if (parsed.data.mocked) {
      return NextResponse.json(
        { error: "Mock location detected. Please disable mock/fake GPS apps and try again." },
        { status: 409 },
      );
    }
    const target = await resolveGeofenceTarget({ ...user, workMode: effectiveWorkMode });
    if (target) {
      if (parsed.data.latitude === undefined || parsed.data.longitude === undefined) {
        return NextResponse.json(
          { error: "Location permission is required to check in." },
          { status: 400 },
        );
      }
      const distance = haversineDistanceMeters(
        parsed.data.latitude,
        parsed.data.longitude,
        target.latitude,
        target.longitude,
      );
      if (distance > target.radiusMeters && offline) {
        offlineOutsideArea = true;
      } else if (distance > target.radiusMeters) {
        const message =
          effectiveWorkMode === "WFH"
            ? "You are outside your assigned work location."
            : `You are outside the permitted office area. Please move within ${Math.round(
                target.radiusMeters,
              )} meters of the office to check in.`;
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }
  }

  // An employee may only check in once and check out once per calendar day.
  const todaysRecords = await prisma.attendance.findMany({
    where: {
      userId: user.id,
      timestamp: offline ? { gte: startOfISTDay(eventTime), lte: endOfISTDay(eventTime) } : { gte: startOfISTDay() },
    },
    orderBy: { timestamp: "asc" },
    select: { id: true, type: true, timestamp: true },
  });
  let hasCheckedInToday = todaysRecords.some((r) => r.type === "CHECK_IN");
  // Only a check-out AFTER today's check-in counts. An overnight shift's check-out lands after midnight, so
  // last night's session closes with a CHECK_OUT dated today (e.g. 12:30 AM) — that is not today's check-out.
  const todaysFirstCheckIn = todaysRecords.find((r) => r.type === "CHECK_IN");
  const hasCheckedOutToday = todaysFirstCheckIn
    ? todaysRecords.some((r) => r.type === "CHECK_OUT" && r.timestamp > todaysFirstCheckIn.timestamp)
    : todaysRecords.some((r) => r.type === "CHECK_OUT");

  // A CHECK_OUT with no check-in among *today's* records might still be
  // closing out an overnight shift that started yesterday (see
  // lib/activeSession.ts) — e.g. checked in 4pm for a 16:00-02:00 shift,
  // checking out at 1am the next IST day. Only checked for CHECK_OUT:
  // autoCloseStaleCheckIns above already swept up any genuinely-forgotten
  // previous-day check-in before a fresh CHECK_IN ever reaches this gate, so
  // that path needs no change.
  let overnightCheckIn: { id: string; timestamp: Date } | null = null;
  if (parsed.data.action === "CHECK_OUT" && !hasCheckedInToday) {
    overnightCheckIn = await findActiveCheckIn(user.id);
    if (overnightCheckIn) hasCheckedInToday = true;
  }

  if (parsed.data.action === "CHECK_IN" && hasCheckedInToday) {
    return NextResponse.json({ error: "You've already checked in today." }, { status: 409 });
  }
  if (parsed.data.action === "CHECK_OUT" && !hasCheckedInToday) {
    return NextResponse.json({ error: "Check in before you can check out." }, { status: 409 });
  }
  if (parsed.data.action === "CHECK_OUT" && hasCheckedOutToday) {
    return NextResponse.json({ error: "You've already checked out today." }, { status: 409 });
  }

  // An end odometer reading can't be lower than the start reading taken at
  // check-in — catches a typo before it silently corrupts the day's distance.
  if (parsed.data.action === "CHECK_OUT" && parsed.data.odometerKm !== undefined) {
    const startRow = await prisma.attendance.findFirst({
      where: { userId: user.id, type: "CHECK_IN", odometerKm: { not: null } },
      orderBy: { timestamp: "desc" },
      select: { odometerKm: true, timestamp: true },
    });
    if (startRow?.odometerKm != null && parsed.data.odometerKm < startRow.odometerKm) {
      return NextResponse.json(
        { error: `End km can't be less than the start km (${startRow.odometerKm}).` },
        { status: 400 },
      );
    }
  }

  const now = eventTime;
  // A fresh secret per check-in, returned once in the response; only its hash is stored.
  const trackingSecret = parsed.data.action === "CHECK_IN" ? newTrackingToken() : null;
  const lateness =
    parsed.data.action === "CHECK_IN"
      ? computeLateness(
          { workMode: user.workMode, shift: shiftForDate(shiftMap, now) },
          now,
          settings.lateThresholdMinutes,
        )
      : { lateMinutes: null, leaveType: "NONE" as const };

  // Attendance + its first WorkSegment are created atomically — the segment
  // depends on the new record's id, so this needs the interactive
  // transaction form rather than a plain batch. Without this, a failure
  // partway through would leave a check-in with no segment at all, silently
  // breaking Field/Office tracking for that entire day.
  //
  // The hasCheckedInToday/hasCheckedOutToday checks above are a read
  // separate from this write — two concurrent requests can both read "not
  // checked in yet" before either commits. The real guarantee is the
  // (userId, type, dayKey) unique constraint on Attendance (see
  // prisma/schema.prisma): whichever request loses the race gets a unique-
  // constraint violation here instead of a duplicate row, caught below and
  // turned into the same friendly error the read-based check above returns.
  let record;
  try {
    record = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          userId: user.id,
          type: parsed.data.action,
          method: "PIN",
          timestamp: now,
          // A check-out belongs to the day its session started (one per session day), so a shift that ends after
          // midnight does not take the next day's slot and block that day's own check-out.
          dayKey: istDateKey(
            parsed.data.action === "CHECK_OUT"
              ? (todaysRecords.find((r) => r.type === "CHECK_IN") ?? overnightCheckIn)?.timestamp ?? now
              : now,
          ),
          lateMinutes: lateness.lateMinutes,
          leaveType: lateness.leaveType,
          ...(parsed.data.action === "CHECK_IN" && user.workMode === "FIELD"
            ? { checkInMode: effectiveWorkMode === "OFFICE" ? "OFFICE" : "FIELD" }
            : parsed.data.action === "CHECK_IN" && user.workMode === "HYBRID"
              ? { checkInMode: hybridPlace ?? "OFFICE" }
              : // For WFH, only record a value when they actually chose Office
              // that day — CheckInMode's "HOME" is HYBRID-only, and leaving the
              // field null for an ordinary WFH-from-home day (the vast
              // majority) preserves its existing meaning everywhere else that
              // reads it, which all assume it's FIELD-specific.
              parsed.data.action === "CHECK_IN" &&
                user.workMode === "WFH" &&
                effectiveWorkMode === "OFFICE"
              ? { checkInMode: "OFFICE" }
              : {}),
          ...(parsed.data.odometerKm !== undefined ? { odometerKm: parsed.data.odometerKm } : {}),
          ...(photoBuffer ? { photo: photoBuffer, hasPhoto: true } : {}),
          faceVerifyStatus,
          faceSimilarity,
          ...(trackingSecret ? { trackingTokenHash: trackingSecret.hash } : {}),
          ...(offline
            ? {
                recordedOffline: true,
                offlineReceivedAt: new Date(),
                offlineTimeVerified: offline.timeVerified,
                offlineOutsideArea,
                clientId: offline.clientId,
              }
            : {}),
        },
      });

      // FIELD-workMode employees get a WorkSegment timeline, starting with
      // whatever they picked here — see /api/kiosk/location's
      // evaluateWorkSegment for how it evolves (auto-detected or manually
      // switched) over the day. OFFICE/WFH employees never get one; their
      // mode never changes mid-day.
      if (parsed.data.action === "CHECK_IN" && user.workMode === "FIELD") {
        await tx.workSegment.create({
          data: {
            attendanceId: created.id,
            mode: effectiveWorkMode === "OFFICE" ? "OFFICE" : "FIELD",
            startedAt: created.timestamp,
            startMethod: "CHECKIN",
          },
        });
      }
      // HYBRID: the day starts as OFFICE or HOME (wherever they checked in);
      // see /api/kiosk/location's evaluateHybridSegment for how it moves
      // through TRANSIT afterwards.
      if (parsed.data.action === "CHECK_IN" && user.workMode === "HYBRID") {
        await tx.workSegment.create({
          data: {
            attendanceId: created.id,
            mode: hybridPlace ?? "OFFICE",
            startedAt: created.timestamp,
            startMethod: "CHECKIN",
          },
        });
      }

      return created;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Two copies of the same offline attempt arrived together: the other one won, so report it as recorded.
      if (offline) {
        const winner = await prisma.attendance.findUnique({
          where: { clientId: offline.clientId },
          select: { id: true, type: true, timestamp: true, lateMinutes: true, leaveType: true, checkInMode: true, offlineOutsideArea: true },
        });
        if (winner) {
          return NextResponse.json({
            id: winner.id,
            name: user.name,
            employeeCode: user.employeeCode,
            type: winner.type,
            timestamp: winner.timestamp,
            lateMinutes: winner.lateMinutes,
            leaveType: winner.leaveType,
            checkInMode: winner.checkInMode,
            workMode: user.workMode,
            recordedOffline: true,
            offlineOutsideArea: winner.offlineOutsideArea,
            idempotentReplay: true,
          });
        }
      }
      const message =
        parsed.data.action === "CHECK_IN" ? "You've already checked in today." : "You've already checked out today.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    throw err;
  }

  // Closing the loop on auto-pause (see /api/kiosk/location): don't leave a
  // pause dangling open past checkout, and clear any pending grace-period
  // warning — the session is over regardless of where either stood.
  if (parsed.data.action === "CHECK_OUT") {
    const todaysCheckIn = todaysRecords.find((r) => r.type === "CHECK_IN") ?? overnightCheckIn;
    if (todaysCheckIn) {
      await prisma.$transaction([
        prisma.attendancePause.updateMany({
          where: { attendanceId: todaysCheckIn.id, resumedAt: null },
          data: { resumedAt: record.timestamp },
        }),
        prisma.attendance.update({
          where: { id: todaysCheckIn.id },
          data: { pauseWarningAt: null },
        }),
        // Same closing-the-loop treatment for the work-segment timeline —
        // don't leave the last segment dangling open past checkout.
        prisma.workSegment.updateMany({
          where: { attendanceId: todaysCheckIn.id, endedAt: null },
          data: { endedAt: record.timestamp },
        }),
      ]);

      // Close out an active overtime request, if any — the summary/photo
      // are both optional and never block this checkout either way (see
      // the schema comment on OvertimeRequest.workSummary); absent, the
      // request is simply marked submitted with nothing attached, visible
      // to admins as "no summary given."
      const activeOvertime = await prisma.overtimeRequest.findFirst({
        where: { attendanceId: todaysCheckIn.id, submittedAt: null },
        orderBy: { createdAt: "desc" },
      });
      if (activeOvertime) {
        const overtimePhoto = parsed.data.overtimeSummaryPhoto
          ? await decodePhoto(parsed.data.overtimeSummaryPhoto)
          : null;
        await prisma.overtimeRequest.update({
          where: { id: activeOvertime.id },
          data: {
            workSummary: parsed.data.overtimeSummary || null,
            ...(overtimePhoto ? { photo: overtimePhoto, hasPhoto: true } : {}),
            submittedAt: record.timestamp,
          },
        });
      }
    }
  }

  return NextResponse.json({
    id: record.id,
    name: user.name,
    employeeCode: user.employeeCode,
    type: record.type,
    timestamp: record.timestamp,
    lateMinutes: record.lateMinutes,
    leaveType: record.leaveType,
    checkInMode: record.checkInMode,
    workMode: user.workMode,
    ...(offline ? { recordedOffline: true, offlineOutsideArea } : {}),
    // Shown only here: the caller must send it with every location upload for this session.
    ...(trackingSecret ? { trackingToken: trackingSecret.token } : {}),
  });
}
