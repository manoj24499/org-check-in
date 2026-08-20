import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { haversineDistanceMeters } from "@/lib/geofence";
import { resolveGeofenceTarget, resolveOfficeLocationTarget, type GeofenceTarget } from "@/lib/geofenceTarget";
import type { CheckInMode } from "@prisma/client";
import { sendPushNotification } from "@/lib/pushNotifications";
import { combineDateAndShiftTime } from "@/lib/shiftTime";
import { loadShiftAssignments, shiftForDate } from "@/lib/shiftAssignment";

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
 * The geofence target for a WFH/OFFICE employee's session — not just at
 * check-in. A WFH employee who chose "Office" for the day (see
 * /api/kiosk/scan's effectiveWorkMode) needs to keep being checked against
 * the office location for every ping afterward too, not just the initial
 * check-in gate; otherwise the very next ping would see them "away from
 * home" and start the auto-pause countdown despite them having said they'd
 * be in the office. FIELD is resolved separately via its own segment-based
 * target and never calls this.
 */
async function resolveSessionTarget(
  user: Parameters<typeof resolveGeofenceTarget>[0],
  checkInMode: CheckInMode | null,
): Promise<GeofenceTarget | null> {
  if (user.workMode === "WFH" && checkInMode === "OFFICE") {
    return resolveOfficeLocationTarget();
  }
  return resolveGeofenceTarget(user);
}

/**
 * Auto-pause/resume evaluation, run on every ping against whichever target
 * (if any) applies right now — the caller resolves that, since it's no
 * longer a static per-profile decision: an OFFICE/WFH employee's target is
 * fixed for the whole day, but a FIELD employee's is null or the office
 * target depending on their *current* WorkSegment (see evaluateWorkSegment
 * below). No target == not enforced, same precedent as the check-in gate.
 * Best-effort: never throws, so a bug here can never break ping ingestion.
 *
 * Only manages geofence-departure pauses (`timedPermissionId: null`) —
 * a pause opened by evaluateTimedPermission below is resolved on its own
 * timeline, not this one, so the open-pause lookup here deliberately
 * excludes it.
 */
async function evaluatePauseState(
  checkIn: { id: string; userId: string; timestamp: Date; pauseWarningAt: Date | null },
  target: GeofenceTarget | null,
  ping: { latitude: number; longitude: number; timestamp: Date },
) {
  try {
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

/**
 * Field/Office segment-switch detection for FIELD-workMode employees only —
 * OFFICE/WFH employees have no WorkSegment timeline at all (see
 * /api/kiosk/scan) and never reach this. Runs on every ping regardless of
 * whether a timed-permission or geofence pause is currently active — where
 * someone physically is doesn't depend on whether their time is paused.
 *
 * Symmetric in both directions, using the same 3-consecutive-ping streak
 * standard as the geofence auto-pause: confirmed arrival at the office
 * closes the current FIELD segment and opens an OFFICE one (which then
 * behaves exactly like a normal office day for evaluatePauseState above —
 * geofenced, auto-pause-on-departure applies); confirmed departure does the
 * reverse. A single stray reading near the office boundary never flips this
 * on its own. A manual correction (see /api/mobile/me/work-segment) can
 * always override the current segment directly, independent of this.
 *
 * Returns the *current* segment's mode after this ping, plus the office
 * target already resolved along the way (so the caller doesn't need to
 * re-fetch it) — or null if this employee somehow has no open segment yet
 * (shouldn't happen once checked in; the caller just skips geofencing for
 * this ping if so, same fail-open precedent as everywhere else here).
 */
async function evaluateWorkSegment(
  checkIn: { id: string; userId: string },
  ping: { latitude: number; longitude: number; timestamp: Date },
): Promise<{ mode: "OFFICE" | "FIELD"; officeTarget: GeofenceTarget | null } | null> {
  try {
    const current = await prisma.workSegment.findFirst({
      where: { attendanceId: checkIn.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!current) return null;

    const officeTarget = await resolveOfficeLocationTarget();
    if (!officeTarget) return { mode: current.mode, officeTarget: null };

    const { inRange, confirmed } = await evaluateRangeStreak(
      checkIn.userId,
      current.startedAt,
      officeTarget,
      ping,
    );
    if (!confirmed) return { mode: current.mode, officeTarget };

    const shouldSwitch = current.mode === "FIELD" ? inRange : !inRange;
    if (!shouldSwitch) return { mode: current.mode, officeTarget };

    const nextMode = current.mode === "FIELD" ? "OFFICE" : "FIELD";
    await prisma.$transaction([
      prisma.workSegment.update({ where: { id: current.id }, data: { endedAt: ping.timestamp } }),
      prisma.workSegment.create({
        data: { attendanceId: checkIn.id, mode: nextMode, startedAt: ping.timestamp, startMethod: "AUTO" },
      }),
    ]);
    return { mode: nextMode, officeTarget };
  } catch (error) {
    console.error("[evaluateWorkSegment] failed:", error);
    return null;
  }
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
  checkIn: { id: string; userId: string; timestamp: Date; checkInMode: CheckInMode | null },
  user: Parameters<typeof resolveGeofenceTarget>[0],
  shiftThatDay: { endTime: string } | null,
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
    const shiftEnd = shiftThatDay ? combineDateAndShiftTime(checkIn.timestamp, shiftThatDay.endTime) : null;
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
    const target = user.workMode === "FIELD" ? null : await resolveSessionTarget(user, checkIn.checkInMode);
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
  });
  if (!user || !user.active) {
    return NextResponse.json({ tracking: false });
  }

  // Whatever shift applies on the check-in's own weekday — an employee can
  // be on a different shift on different days (see lib/shiftAssignment.ts).
  const shiftMap = await loadShiftAssignments(user.id);
  const shiftThatDay = shiftForDate(shiftMap, checkIn.timestamp);

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

  const permissionResult = await evaluateTimedPermission(checkIn, user, shiftThatDay, ping);

  // Field/office segment tracking runs regardless of pause state — where
  // someone physically is doesn't depend on whether their time is paused.
  // Not applicable at all outside FIELD-workMode profiles.
  const segmentResult = user.workMode === "FIELD" ? await evaluateWorkSegment(checkIn, ping) : null;

  // A timed permission's pause is managed on its own timeline — skip the
  // geofence auto-pause entirely while one is open, so the two never both
  // try to act on the same session's pause state for the same ping.
  if (!permissionResult.active) {
    // For a FIELD profile, geofencing only applies while their *current*
    // segment is OFFICE — reusing the office target evaluateWorkSegment
    // already resolved, rather than fetching it again. Non-FIELD profiles
    // are unaffected: same fixed-for-the-day target as before.
    const target =
      user.workMode === "FIELD"
        ? segmentResult?.mode === "OFFICE"
          ? segmentResult.officeTarget
          : null
        : await resolveSessionTarget(user, checkIn.checkInMode);
    await evaluatePauseState(checkIn, target, ping);
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
