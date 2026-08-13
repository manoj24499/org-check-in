import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { sendPushNotification } from "@/lib/pushNotifications";

// A ping streak only counts as "consecutive" if readings are this close
// together — otherwise irregular/throttled background delivery (the app was
// backgrounded, the OS throttled it, a brief connectivity gap) could be
// mistaken for a genuine run of readings.
const MAX_STREAK_GAP_MS = 5 * 60 * 1000;
const GRACE_PERIOD_MS = 10 * 60 * 1000;
const STREAK_LENGTH = 3;

/**
 * Auto-pause/resume evaluation, run on every ping for OFFICE/WFH employees
 * with a resolved geofence target (FIELD, or no target configured, skip
 * entirely — same precedent as the check-in geofence gate). Best-effort:
 * never throws, so a bug here can never break ping ingestion itself.
 */
async function evaluatePauseState(
  checkIn: { id: string; userId: string; timestamp: Date; pauseWarningAt: Date | null },
  user: Parameters<typeof resolveGeofenceTarget>[0],
  ping: { latitude: number; longitude: number; timestamp: Date },
) {
  try {
    const target = await resolveGeofenceTarget(user);
    if (!target) return;

    const inRange =
      haversineDistanceMeters(ping.latitude, ping.longitude, target.latitude, target.longitude) <=
      target.radiusMeters;

    const priorPings = await prisma.locationPing.findMany({
      where: { userId: checkIn.userId, timestamp: { gte: checkIn.timestamp, lt: ping.timestamp } },
      orderBy: { timestamp: "desc" },
      take: STREAK_LENGTH - 1,
    });

    const readings = [
      { timestamp: ping.timestamp, inRange },
      ...priorPings.map((p) => ({
        timestamp: p.timestamp,
        inRange:
          haversineDistanceMeters(p.latitude, p.longitude, target.latitude, target.longitude) <=
          target.radiusMeters,
      })),
    ];

    let streak = 1;
    for (let i = 1; i < readings.length; i++) {
      const gapMs = readings[i - 1].timestamp.getTime() - readings[i].timestamp.getTime();
      if (gapMs > MAX_STREAK_GAP_MS || readings[i].inRange !== readings[0].inRange) break;
      streak++;
    }
    const confirmed = streak >= STREAK_LENGTH;

    const openPause = await prisma.attendancePause.findFirst({
      where: { attendanceId: checkIn.id, resumedAt: null },
    });

    if (openPause) {
      // Currently paused — resume only once back-in-range is confirmed.
      if (inRange && confirmed) {
        await prisma.attendancePause.update({
          where: { id: openPause.id },
          data: { resumedAt: ping.timestamp },
        });
      }
      return;
    }

    if (inRange) {
      // Not paused, in range — clear a pending warning if there was one
      // (they returned before the grace period expired; false alarm).
      if (checkIn.pauseWarningAt) {
        await prisma.attendance.update({ where: { id: checkIn.id }, data: { pauseWarningAt: null } });
      }
      return;
    }

    // Not paused, out of range.
    if (!checkIn.pauseWarningAt) {
      if (confirmed) {
        await prisma.attendance.update({
          where: { id: checkIn.id },
          data: { pauseWarningAt: ping.timestamp },
        });
        await sendPushNotification(
          checkIn.userId,
          "You've left your work area",
          "Return within 10 minutes or your working time will be paused.",
        );
      }
      return;
    }

    const graceElapsedMs = ping.timestamp.getTime() - checkIn.pauseWarningAt.getTime();
    if (graceElapsedMs >= GRACE_PERIOD_MS) {
      await prisma.$transaction([
        prisma.attendancePause.create({
          data: { attendanceId: checkIn.id, pausedAt: checkIn.pauseWarningAt },
        }),
        prisma.attendance.update({ where: { id: checkIn.id }, data: { pauseWarningAt: null } }),
      ]);
    }
  } catch (error) {
    console.error("[evaluatePauseState] failed:", error);
  }
}

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
  const ip = getClientIp(req);
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

  await evaluatePauseState(checkIn, user, {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    timestamp,
  });

  await prisma.locationPing.create({
    data: {
      userId: checkIn.userId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy: parsed.data.accuracy,
      timestamp,
    },
  });

  return NextResponse.json({ tracking: true });
}
