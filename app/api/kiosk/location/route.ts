import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";
import { publishLocationUpdate } from "@/lib/locationEvents";

// The check-in attendance id doubles as an unguessable, session-scoped
// capability token — no PIN re-entry needed for a background 1-minute ping.
const bodySchema = z.object({
  attendanceId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0),
  timestamp: z.string(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  // Generous enough for many employees behind one shared office IP each
  // pinging ~once a minute (plus the occasional immediate wake-up ping),
  // while still guarding against genuine abuse.
  if (isRateLimited(`location:${ip}`, 60_000, 120)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const checkIn = await prisma.attendance.findUnique({
    where: { id: parsed.data.attendanceId },
  });

  if (!checkIn || checkIn.type !== "CHECK_IN") {
    return NextResponse.json({ tracking: false, error: "Session not found." }, { status: 404 });
  }

  const user = await prisma.user.findUnique({ where: { id: checkIn.userId } });
  if (!user || !user.active) {
    return NextResponse.json({ tracking: false });
  }

  // If the employee has since checked out (from any device), the session is
  // over — tell the client to stop, without recording a stray ping.
  const laterCheckOut = await prisma.attendance.findFirst({
    where: {
      userId: checkIn.userId,
      type: "CHECK_OUT",
      timestamp: { gt: checkIn.timestamp },
    },
  });

  if (laterCheckOut) {
    return NextResponse.json({ tracking: false });
  }

  const timestamp = new Date(parsed.data.timestamp);

  await prisma.locationPing.create({
    data: {
      userId: checkIn.userId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy: parsed.data.accuracy,
      timestamp,
    },
  });

  publishLocationUpdate({
    userId: checkIn.userId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    accuracy: parsed.data.accuracy,
    timestamp: timestamp.toISOString(),
  });

  return NextResponse.json({ tracking: true });
}
