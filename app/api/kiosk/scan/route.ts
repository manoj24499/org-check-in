import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/credentials";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { getSettings } from "@/lib/settings";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { verifyFace } from "@/lib/faceVerify";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { combineDateAndShiftTime, computeLateness } from "@/lib/shiftTime";
import { loadShiftAssignments, shiftForDate, type WeekdayShiftMap } from "@/lib/shiftAssignment";
import { startOfISTDay, endOfISTDay, todayDateOnlyIST, istDateKey } from "@/lib/istTime";

const scanSchema = z.object({
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
  checkInMode: z.enum(["OFFICE", "FIELD"]).optional(),
  // Only meaningful on CHECK_OUT, and only when the employee has an active
  // OvertimeRequest for today (see /api/mobile/me/overtime) — optional even
  // then, never required to actually check out (see the schema comment on
  // OvertimeRequest.workSummary).
  overtimeSummary: z.string().trim().max(1000).optional(),
  overtimeSummaryPhoto: z.string().optional(),
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
    const shiftEnd = shiftThatDay ? combineDateAndShiftTime(checkIn.timestamp, shiftThatDay.endTime) : null;
    const checkoutAt = shiftEnd && shiftEnd > checkIn.timestamp ? shiftEnd : dayEnd;

    try {
      await prisma.$transaction([
        prisma.attendance.create({
          data: {
            userId: user.id,
            type: "CHECK_OUT",
            method: "AUTO",
            timestamp: checkoutAt,
            dayKey: istDateKey(checkoutAt),
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
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/kiosk/scan] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
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
  const parsed = scanSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The IP-based limit above only slows a single-source attacker — a kiosk
  // is shared by every employee behind one office IP, so it can't be tuned
  // tight enough to also block someone who spreads guesses across many
  // IPs/proxies (or switches to the mobile app or web login to get a fresh
  // budget) without breaking legitimate shared-kiosk use. isPinGuessLimited
  // is shared across every PIN-checking surface, keyed only on employeeCode,
  // so guesses against one account are capped regardless of source IP or
  // entry point. Checked before any photo decoding — no reason to make an
  // attacker do that work first.
  if (await isPinGuessLimited(parsed.data.employeeCode)) {
    return NextResponse.json(
      { error: "Too many attempts for this employee code. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  await expireOldPhotos();

  // A presence photo is always mandatory for check-in; for check-out it
  // depends on the admin-configured setting. Only the cheap presence check
  // happens here — actually decoding it (sharp resize/re-encode of up to
  // ~5.3MB) waits until after credentials are verified below, so a caller
  // with no valid employee code/PIN can never force that work. Without
  // this ordering, isPinGuessLimited above doesn't help: it's keyed by
  // employeeCode, so an attacker supplying a fresh/nonexistent code on every
  // request always passes it, then this used to decode a full photo before
  // ever checking whether the credentials were even plausible.
  const settings = await getSettings();
  const photoRequired =
    parsed.data.action === "CHECK_IN" ||
    (parsed.data.action === "CHECK_OUT" && settings.checkOutPhotoRequired);

  if (photoRequired && !parsed.data.photo) {
    const verb = parsed.data.action === "CHECK_IN" ? "check in" : "check out";
    return NextResponse.json({ error: `A photo is required to ${verb}.` }, { status: 400 });
  }

  const candidate = await prisma.user.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
  });
  const user =
    candidate?.pinHash && (await verifyPin(parsed.data.pin, candidate.pinHash)) ? candidate : null;

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your employee code and PIN and try again." },
      { status: 401 }
    );
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
    const result = await verifyFace(user.employeeCode, photoBuffer);
    if (result.outcome === "matched") {
      faceVerifyStatus = "MATCHED";
      faceSimilarity = result.similarity;
    } else if (result.outcome === "mismatch") {
      faceVerifyStatus = "MISMATCH";
      faceSimilarity = result.similarity;
      return NextResponse.json({ error: result.message }, { status: 401 });
    } else {
      faceVerifyStatus = "UNAVAILABLE";
    }
  }

  // Loaded once and reused below — an employee can be on a different shift
  // on different weekdays (see lib/shiftAssignment.ts).
  const shiftMap = await loadShiftAssignments(user.id);

  // Sweep up any forgotten check-in from a previous day before doing
  // anything else — see autoCloseStaleCheckIns for why this can't wait.
  if (parsed.data.action === "CHECK_IN") {
    await autoCloseStaleCheckIns(user, shiftMap, startOfISTDay());
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
    const today = todayDateOnlyIST();
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

  // Geofence the check-in against whichever location applies to this
  // employee. No location configured yet (office or home) == not enforced.
  if (parsed.data.action === "CHECK_IN" && effectiveWorkMode !== "FIELD") {
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
      if (distance > target.radiusMeters) {
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
    where: { userId: user.id, timestamp: { gte: startOfISTDay() } },
    orderBy: { timestamp: "asc" },
    select: { id: true, type: true },
  });
  const hasCheckedInToday = todaysRecords.some((r) => r.type === "CHECK_IN");
  const hasCheckedOutToday = todaysRecords.some((r) => r.type === "CHECK_OUT");

  if (parsed.data.action === "CHECK_IN" && hasCheckedInToday) {
    return NextResponse.json({ error: "You've already checked in today." }, { status: 409 });
  }
  if (parsed.data.action === "CHECK_OUT" && !hasCheckedInToday) {
    return NextResponse.json({ error: "Check in before you can check out." }, { status: 409 });
  }
  if (parsed.data.action === "CHECK_OUT" && hasCheckedOutToday) {
    return NextResponse.json({ error: "You've already checked out today." }, { status: 409 });
  }

  const now = new Date();
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
          dayKey: istDateKey(now),
          lateMinutes: lateness.lateMinutes,
          leaveType: lateness.leaveType,
          ...(parsed.data.action === "CHECK_IN" && user.workMode === "FIELD"
            ? { checkInMode: effectiveWorkMode === "OFFICE" ? "OFFICE" : "FIELD" }
            : // For WFH, only record a value when they actually chose Office
              // that day — CheckInMode has no "HOME" value, and leaving the
              // field null for an ordinary WFH-from-home day (the vast
              // majority) preserves its existing meaning everywhere else that
              // reads it, which all assume it's FIELD-specific.
              parsed.data.action === "CHECK_IN" &&
                user.workMode === "WFH" &&
                effectiveWorkMode === "OFFICE"
              ? { checkInMode: "OFFICE" }
              : {}),
          ...(photoBuffer ? { photo: photoBuffer, hasPhoto: true } : {}),
          faceVerifyStatus,
          faceSimilarity,
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

      return created;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
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
    const todaysCheckIn = todaysRecords.find((r) => r.type === "CHECK_IN");
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
  });
}
