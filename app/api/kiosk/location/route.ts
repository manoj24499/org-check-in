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
 * Checks whether the given ping represents a *confirmed* reading — the last
 * STREAK_LENGTH pings (this one plus recent history) all agree on in-range
 * vs. out-of-range, with no gap between them wide enough to suggest a
 * missed/delayed ping rather than a genuine streak. Shared by the geofence
 * auto-pause below and the timed-permission resume check, so both apply the
 * exact same "is this really confirmed, or just a blip" standard.
 */
async function evaluateRangeStreak(
  userId: string,
  sinceTimestamp: Date,
  target: { latitude: number; longitude: number; radiusMeters: number },
  ping: { latitude: number; longitude: number; timestamp: Date },
): Promise<{ inRange: boolean; confirmed: boolean }> {
  const inRange =
    haversineDistanceMeters(ping.latitude, ping.longitude, target.latitude, target.longitude) <=
    target.radiusMeters;

  const priorPings = await prisma.locationPing.findMany({
    where: { userId, timestamp: { gte: sinceTimestamp, lt: ping.timestamp } },
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

  return { inRange, confirmed: streak >= STREAK_LENGTH };
}

/**
 * Auto-pause/resume evaluation, run on every ping for OFFICE/WFH employees
 * with a resolved geofence target (FIELD, or no target configured, skip
 * entirely — same precedent as the check-in geofence gate). Best-effort:
 * never throws, so a bug here can never break ping ingestion itself.
 *
 * Only manages geofence-departure pauses (`timedPermissionId: null`) —
 * a pause opened by evaluateTimedPermission below is resolved on its own
 * timeline, not this one, so the open-pause lookup here deliberately
 * excludes it.
 */
async function evaluatePauseState(
  checkIn: { id: string; userId: string; timestamp: Date; pauseWarningAt: Date | null },
  user: Parameters<typeof resolveGeofenceTarget>[0],
  ping: { latitude: number; longitude: number; timestamp: Date },
) {
  try {
    const target = await resolveGeofenceTarget(user);
    if (!target) return;

    const { inRange, confirmed } = await evaluateRangeStreak(checkIn.userId, checkIn.timestamp, target, ping);

    const openPause = await prisma.attendancePause.findFirst({
      where: { attendanceId: checkIn.id, resumedAt: null, timedPermissionId: null },
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

const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Combines an "HH:mm" shift time with the calendar date of `referenceDate`. */
function combineDateAndShiftTime(referenceDate: Date, hhmm: string): Date | null {
  const match = SHIFT_TIME_PATTERN.exec(hhmm);
  if (!match) return null;
  const result = new Date(referenceDate);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

/**
 * Timed-permission evaluation, run on every ping *before* the geofence
 * auto-pause above — an employee's manually-requested "pause me from 2pm to
 * 4pm" window. Unlike the geofence pause, this one starts on a clock, not a
 * detected departure:
 *  - Opens a pause the first ping at/after the requested start time.
 *  - Past the requested end time: FIELD employees (no fixed geofence to
 *    return to) resume immediately; OFFICE/WFH employees only resume once
 *    back-in-range is *confirmed* — otherwise the pause simply stays open
 *    ("extends") until they are.
 *  - If the permission runs through the employee's shift end, auto-checks
 *    them out instead of waiting for a resume that was never coming.
 *
 * Returns `active: true` while a permission-linked pause is open, so the
 * caller can skip the geofence auto-pause for this ping — the two must never
 * both try to manage the same session's pause state at once.
 *
 * Only ever considers APPROVED permissions — a PENDING or REJECTED one is
 * invisible here, so an unapproved request simply does nothing until an
 * admin decides it (see /api/admin/timed-permissions/[id]). Approving one
 * whose window already started (or even already ended) still works
 * correctly with no special-casing, since this is purely a function of
 * "where does ping.timestamp fall relative to startTime/endTime" — it
 * doesn't matter when the approval itself happened.
 */
async function evaluateTimedPermission(
  checkIn: { id: string; userId: string; timestamp: Date },
  user: Parameters<typeof resolveGeofenceTarget>[0] & { shift: { endTime: string } | null },
  ping: { latitude: number; longitude: number; timestamp: Date },
): Promise<{ active: boolean; autoCheckedOut: boolean }> {
  try {
    const permission = await prisma.timedPermission.findFirst({
      where: {
        attendanceId: checkIn.id,
        approvalStatus: "APPROVED",
        startTime: { lte: ping.timestamp },
        OR: [{ pause: null }, { pause: { resumedAt: null } }],
      },
      orderBy: { startTime: "desc" },
      include: { pause: true },
    });
    if (!permission) return { active: false, autoCheckedOut: false };

    if (!permission.pause) {
      // First ping at/after the requested start — open the pause.
      await prisma.attendancePause.create({
        data: { attendanceId: checkIn.id, pausedAt: permission.startTime, timedPermissionId: permission.id },
      });
      return { active: true, autoCheckedOut: false };
    }

    if (ping.timestamp < permission.endTime) {
      // Still within the requested window — stay paused.
      return { active: true, autoCheckedOut: false };
    }

    // Requested end time has passed. If it runs through the employee's
    // shift end, there's no shift left to resume into — auto-checkout.
    const shiftEnd = user.shift ? combineDateAndShiftTime(checkIn.timestamp, user.shift.endTime) : null;
    if (shiftEnd && permission.endTime >= shiftEnd) {
      await prisma.$transaction([
        prisma.attendancePause.update({
          where: { id: permission.pause.id },
          data: { resumedAt: permission.endTime },
        }),
        prisma.attendance.create({
          data: {
            userId: checkIn.userId,
            type: "CHECK_OUT",
            method: "AUTO",
            timestamp: permission.endTime,
          },
        }),
      ]);
      return { active: true, autoCheckedOut: true };
    }

    // FIELD employees have no fixed geofence to return to (same precedent
    // as the geofence auto-pause skipping them entirely) — resume on the
    // clock alone, no presence check.
    const target = user.workMode === "FIELD" ? null : await resolveGeofenceTarget(user);
    if (!target) {
      await prisma.attendancePause.update({
        where: { id: permission.pause.id },
        data: { resumedAt: permission.endTime },
      });
      return { active: false, autoCheckedOut: false };
    }

    // OFFICE/WFH — only resume once back-in-range is confirmed; otherwise
    // the pause stays open, i.e. the permission "extends" past its
    // requested end time until they actually return.
    const { inRange, confirmed } = await evaluateRangeStreak(checkIn.userId, permission.startTime, target, ping);
    if (inRange && confirmed) {
      await prisma.attendancePause.update({
        where: { id: permission.pause.id },
        data: { resumedAt: ping.timestamp },
      });
      return { active: false, autoCheckedOut: false };
    }

    return { active: true, autoCheckedOut: false };
  } catch (error) {
    console.error("[evaluateTimedPermission] failed:", error);
    return { active: false, autoCheckedOut: false };
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

  const user = await prisma.user.findUnique({
    where: { id: checkIn.userId },
    include: { shift: { select: { endTime: true } } },
  });
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
  const ping = { latitude: parsed.data.latitude, longitude: parsed.data.longitude, timestamp };

  const permissionResult = await evaluateTimedPermission(checkIn, user, ping);
  // A timed permission's pause is managed on its own timeline — skip the
  // geofence auto-pause entirely while one is open, so the two never both
  // try to act on the same session's pause state for the same ping.
  if (!permissionResult.active) {
    await evaluatePauseState(checkIn, user, ping);
  }

  await prisma.locationPing.create({
    data: {
      userId: checkIn.userId,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracy: parsed.data.accuracy,
      timestamp,
    },
  });

  if (permissionResult.autoCheckedOut) {
    return NextResponse.json({ tracking: false });
  }

  return NextResponse.json({ tracking: true });
}
