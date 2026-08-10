import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  photo: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

function decodePhoto(dataUrl: string): Uint8Array<ArrayBuffer> | null {
  const match = /^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return new Uint8Array(Buffer.from(match[2], "base64")) as Uint8Array<ArrayBuffer>;
  } catch {
    return null;
  }
}

/** Today's active FIELD check-in — the parent every FieldVisit hangs off. */
async function findTodaysFieldCheckIn(userId: string) {
  return prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: startOfToday() } },
    orderBy: { timestamp: "desc" },
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
    select: { id: true, name: true, reachedAt: true, latitude: true, longitude: true },
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      name: v.name,
      reachedAt: v.reachedAt.toISOString(),
      latitude: v.latitude,
      longitude: v.longitude,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const photoBuffer = decodePhoto(parsed.data.photo);
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
