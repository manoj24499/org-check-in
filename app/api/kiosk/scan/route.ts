import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/credentials";
import { isRateLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { getSettings } from "@/lib/settings";

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
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const PHOTO_RETENTION_DAYS = 45;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

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

function decodePhoto(dataUrl: string): Uint8Array<ArrayBuffer> | null {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    // Copy into a plain ArrayBuffer-backed Uint8Array — Prisma's Bytes type
    // rejects Buffer's wider ArrayBufferLike (which also allows SharedArrayBuffer).
    return new Uint8Array(Buffer.from(match[2], "base64")) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`scan:${ip}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => null);
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
    photoBuffer = decodePhoto(parsed.data.photo);
    if (!photoBuffer) {
      return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
    }
    if (photoBuffer.length > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
    }
  }

  const candidate = await prisma.user.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
  });
  const user =
    candidate?.pinHash && (await verifyHash(parsed.data.pin, candidate.pinHash)) ? candidate : null;

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your employee code and PIN and try again." },
      { status: 401 }
    );
  }

  // Geofence the check-in against whichever location applies to this
  // employee. No location configured yet (office or home) == not enforced.
  // FIELD employees are never geofenced at all — they can check in from
  // anywhere, no location required.
  if (parsed.data.action === "CHECK_IN" && user.workMode !== "FIELD") {
    if (parsed.data.mocked) {
      return NextResponse.json(
        { error: "Mock location detected. Please disable mock/fake GPS apps and try again." },
        { status: 409 },
      );
    }
    const target = await resolveGeofenceTarget(user);
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
          user.workMode === "WFH"
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

  const record = await prisma.attendance.create({
    data: {
      userId: user.id,
      type: parsed.data.action,
      method: "PIN",
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
  });
}
