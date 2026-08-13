import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/credentials";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { getSettings } from "@/lib/settings";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";

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
  // Only meaningful for FIELD-workMode employees on CHECK_IN — the choice
  // they made for today. Defaults to "FIELD" when omitted, preserving the
  // kiosk's existing behavior (it has no UI for this choice).
  checkInMode: z.enum(["OFFICE", "FIELD"]).optional(),
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const SHIFT_START_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Late-arrival classification for OFFICE employees with a configured
 * shiftStartTime: up to 1 hour late is treated as Permission, more than 1
 * hour is Half-day leave. WFH/FIELD employees and anyone without a
 * shiftStartTime set are never classified — leaveType stays NONE.
 */
function computeLateness(
  user: { workMode: string; shift: { startTime: string } | null },
  checkInAt: Date,
): { lateMinutes: number | null; leaveType: "NONE" | "PERMISSION" | "HALF_DAY" } {
  if (user.workMode !== "OFFICE" || !user.shift) {
    return { lateMinutes: null, leaveType: "NONE" };
  }
  const match = SHIFT_START_PATTERN.exec(user.shift.startTime);
  if (!match) return { lateMinutes: null, leaveType: "NONE" };

  const shiftStart = new Date(checkInAt);
  shiftStart.setHours(Number(match[1]), Number(match[2]), 0, 0);

  const lateMinutes = Math.round((checkInAt.getTime() - shiftStart.getTime()) / 60_000);
  if (lateMinutes <= 0) return { lateMinutes: 0, leaveType: "NONE" };
  if (lateMinutes <= 60) return { lateMinutes, leaveType: "PERMISSION" };
  return { lateMinutes, leaveType: "HALF_DAY" };
}

const PHOTO_RETENTION_DAYS = 45;
// A base64-encoded MAX_PHOTO_BYTES photo inflates to ~4/3 of its raw size —
// this caps the raw *request* body (checked before it's ever parsed as
// JSON), so it needs enough headroom above MAX_PHOTO_BYTES for that base64
// overhead plus the other small JSON fields, not just the decoded photo cap.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/** Best-effort cleanup: clear photo bytes (and the hasPhoto flag) once they're past retention. */
async function expireOldPhotos() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PHOTO_RETENTION_DAYS);
  try {
    await prisma.attendance.updateMany({
      where: { hasPhoto: true, timestamp: { lt: cutoff } },
      data: { photo: null, hasPhoto: false },
    });
  } catch {
    // Cleanup is opportunistic — never let it block a real check-in.
  }
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`scan:${ip}`)) {
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

  await expireOldPhotos();

  // A presence photo is always mandatory for check-in; for check-out it
  // depends on the admin-configured setting.
  let photoBuffer: Uint8Array<ArrayBuffer> | null = null;
  const settings = await getSettings();
  const photoRequired =
    parsed.data.action === "CHECK_IN" ||
    (parsed.data.action === "CHECK_OUT" && settings.checkOutPhotoRequired);

  if (photoRequired) {
    if (!parsed.data.photo) {
      const verb = parsed.data.action === "CHECK_IN" ? "check in" : "check out";
      return NextResponse.json({ error: `A photo is required to ${verb}.` }, { status: 400 });
    }
    photoBuffer = await decodePhoto(parsed.data.photo);
    if (!photoBuffer) {
      return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
    }
    if (photoBuffer.length > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
    }
  }

  const candidate = await prisma.user.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
    include: { shift: { select: { startTime: true } } },
  });
  const user =
    candidate?.pinHash && (await verifyPin(parsed.data.pin, candidate.pinHash)) ? candidate : null;

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your employee code and PIN and try again." },
      { status: 401 }
    );
  }

  // A FIELD-workMode employee picks their mode for the day at check-in — if
  // they chose "Office", they're geofenced against the shared office
  // location exactly like a regular OFFICE employee; otherwise (the default)
  // they're never geofenced, same as before this choice existed.
  const effectiveWorkMode: typeof user.workMode =
    user.workMode === "FIELD"
      ? parsed.data.checkInMode === "OFFICE"
        ? "OFFICE"
        : "FIELD"
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
    where: { userId: user.id, timestamp: { gte: startOfToday() } },
    orderBy: { timestamp: "asc" },
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
      ? computeLateness(user, now)
      : { lateMinutes: null, leaveType: "NONE" as const };

  const record = await prisma.attendance.create({
    data: {
      userId: user.id,
      type: parsed.data.action,
      method: "PIN",
      timestamp: now,
      lateMinutes: lateness.lateMinutes,
      leaveType: lateness.leaveType,
      ...(parsed.data.action === "CHECK_IN" && user.workMode === "FIELD"
        ? { checkInMode: effectiveWorkMode === "OFFICE" ? "OFFICE" : "FIELD" }
        : {}),
      ...(photoBuffer ? { photo: photoBuffer, hasPhoto: true } : {}),
    },
  });

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
      ]);
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
