import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { startOfISTDay } from "@/lib/istTime";

// See kiosk/scan/route.ts's identical constant for why this is larger than
// MAX_PHOTO_BYTES: it bounds the raw request body (base64 inflates size by
// ~4/3), checked before the body is ever parsed as JSON.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  photo: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Today's active FIELD check-in — the parent every FieldVisit hangs off. */
async function findTodaysFieldCheckIn(userId: string) {
  return prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: startOfISTDay() } },
    orderBy: { timestamp: "desc" },
    select: { id: true, checkInMode: true },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findTodaysFieldCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json({ visits: [] });

  const visits = await prisma.fieldVisit.findMany({
    where: { attendanceId: checkIn.id },
    orderBy: { reachedAt: "asc" },
    select: { id: true, name: true, reachedAt: true, latitude: true, longitude: true, hasPhoto: true },
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      name: v.name,
      reachedAt: v.reachedAt.toISOString(),
      latitude: v.latitude,
      longitude: v.longitude,
      hasPhoto: v.hasPhoto,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const photoBuffer = await decodePhoto(parsed.data.photo);
  if (!photoBuffer) {
    return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
  }
  if (photoBuffer.length > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
  }

  const checkIn = await findTodaysFieldCheckIn(auth.sub);
  if (!checkIn || checkIn.checkInMode !== "FIELD") {
    return NextResponse.json(
      { error: "Check in with Field mode first to log a location." },
      { status: 409 },
    );
  }

  const visit = await prisma.fieldVisit.create({
    data: {
      attendanceId: checkIn.id,
      name: parsed.data.name,
      photo: photoBuffer,
      hasPhoto: true,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    },
  });

  return NextResponse.json({
    id: visit.id,
    name: visit.name,
    reachedAt: visit.reachedAt.toISOString(),
    latitude: visit.latitude,
    longitude: visit.longitude,
  });
}
