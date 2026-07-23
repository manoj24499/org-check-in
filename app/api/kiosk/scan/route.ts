import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/credentials";
import { isRateLimited } from "@/lib/rateLimit";

const qrSchema = z.object({
  mode: z.literal("qr"),
  qrToken: z.string().min(1),
});

const pinSchema = z.object({
  mode: z.literal("pin"),
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(10),
  action: z.enum(["CHECK_IN", "CHECK_OUT"]),
  photo: z.string().optional(),
});

const bodySchema = z.discriminatedUnion("mode", [qrSchema, pinSchema]);

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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await expireOldPhotos();

  // A presence photo is mandatory for a PIN check-in.
  let photoBuffer: Uint8Array<ArrayBuffer> | null = null;
  if (parsed.data.mode === "pin" && parsed.data.action === "CHECK_IN") {
    if (!parsed.data.photo) {
      return NextResponse.json({ error: "A photo is required to check in." }, { status: 400 });
    }
    photoBuffer = decodePhoto(parsed.data.photo);
    if (!photoBuffer) {
      return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
    }
    if (photoBuffer.length > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
    }
  }

  let user;

  if (parsed.data.mode === "qr") {
    user = await prisma.user.findUnique({
      where: { qrToken: parsed.data.qrToken },
    });
  } else {
    const candidate = await prisma.user.findUnique({
      where: { employeeCode: parsed.data.employeeCode },
    });
    if (candidate?.pinHash && (await verifyHash(parsed.data.pin, candidate.pinHash))) {
      user = candidate;
    } else {
      user = null;
    }
  }

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your QR code or PIN and try again." },
      { status: 401 }
    );
  }

  // An employee may only check in once and check out once per calendar day.
  const todaysRecords = await prisma.attendance.findMany({
    where: { userId: user.id, timestamp: { gte: startOfToday() } },
    orderBy: { timestamp: "asc" },
  });
  const hasCheckedInToday = todaysRecords.some((r) => r.type === "CHECK_IN");
  const hasCheckedOutToday = todaysRecords.some((r) => r.type === "CHECK_OUT");

  let nextType: "CHECK_IN" | "CHECK_OUT";

  if (parsed.data.mode === "pin") {
    nextType = parsed.data.action;
    if (nextType === "CHECK_IN" && hasCheckedInToday) {
      return NextResponse.json(
        { error: "You've already checked in today." },
        { status: 409 }
      );
    }
    if (nextType === "CHECK_OUT" && !hasCheckedInToday) {
      return NextResponse.json(
        { error: "Check in before you can check out." },
        { status: 409 }
      );
    }
    if (nextType === "CHECK_OUT" && hasCheckedOutToday) {
      return NextResponse.json(
        { error: "You've already checked out today." },
        { status: 409 }
      );
    }
  } else {
    if (hasCheckedInToday && hasCheckedOutToday) {
      return NextResponse.json(
        { error: "You've already completed today's attendance." },
        { status: 409 }
      );
    }
    nextType = hasCheckedInToday ? "CHECK_OUT" : "CHECK_IN";
  }

  const record = await prisma.attendance.create({
    data: {
      userId: user.id,
      type: nextType,
      method: parsed.data.mode === "qr" ? "QR" : "PIN",
      ...(photoBuffer ? { photo: photoBuffer, hasPhoto: true } : {}),
    },
  });

  return NextResponse.json({
    id: record.id,
    name: user.name,
    employeeCode: user.employeeCode,
    type: record.type,
    timestamp: record.timestamp,
  });
}
