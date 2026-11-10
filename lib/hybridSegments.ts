import { prisma } from "@/lib/prisma";
import type { User, WorkSegment, WorkSegmentStartMethod } from "@prisma/client";
import { resolveHomeTarget, resolveOfficeLocationTarget, type GeofenceTarget } from "@/lib/geofenceTarget";

/**
 * HYBRID work mode helpers — an employee who works part of the day at the
 * office and part at home, with TRANSIT segments (travel, not work time) in
 * between. Shared by /api/kiosk/scan (first segment), /api/kiosk/location
 * (auto-detection), /api/mobile/me/work-segment (manual switches) and
 * /api/kiosk/status (what the app shows), so they all agree.
 */

/** How long a TRANSIT segment may run before the employee is asked whether they have arrived. */
export const HYBRID_TRANSIT_WINDOW_MINUTES = 45;
export const HYBRID_TRANSIT_WINDOW_MS = HYBRID_TRANSIT_WINDOW_MINUTES * 60 * 1000;

export type HybridPlace = "OFFICE" | "HOME";

/** The geofence for one of a HYBRID employee's two places, or null when that place isn't configured. */
export async function resolveHybridPlaceTarget(
  place: HybridPlace,
  user: Pick<User, "homeLatitude" | "homeLongitude" | "homeRadiusMeters" | "organizationId">,
): Promise<GeofenceTarget | null> {
  if (place === "HOME") return resolveHomeTarget(user);
  return user.organizationId ? resolveOfficeLocationTarget(user.organizationId) : null;
}

/** The currently open segment of a session, if any. */
export function findOpenSegment(attendanceId: string) {
  return prisma.workSegment.findFirst({
    where: { attendanceId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
}

/** Start of the current transit window: the latest "Still travelling", else when transit began. */
export function transitWindowStart(segment: Pick<WorkSegment, "startedAt" | "extendedAt">): Date {
  return segment.extendedAt ?? segment.startedAt;
}

export function isTransitExpired(
  segment: Pick<WorkSegment, "mode" | "startedAt" | "extendedAt">,
  now: Date,
): boolean {
  return (
    segment.mode === "TRANSIT" && now.getTime() - transitWindowStart(segment).getTime() >= HYBRID_TRANSIT_WINDOW_MS
  );
}

/**
 * The JSON shape of a session's current segment, as returned to the mobile app
 * (GET/POST /api/mobile/me/work-segment and /api/kiosk/status). The transit
 * fields are null/false on any non-TRANSIT segment.
 */
export function serializeSegment(segment: WorkSegment | null, now = new Date()) {
  if (!segment) {
    return {
      mode: null,
      startedAt: null,
      heading: null,
      promptedAt: null,
      transitMinutes: null,
      transitWindowEndsAt: null,
      transitExpired: false,
    };
  }
  const transit = segment.mode === "TRANSIT";
  return {
    mode: segment.mode,
    startedAt: segment.startedAt.toISOString(),
    heading: transit ? (segment.heading ?? null) : null,
    promptedAt: segment.promptedAt?.toISOString() ?? null,
    transitMinutes: transit ? Math.max(0, Math.floor((now.getTime() - segment.startedAt.getTime()) / 60_000)) : null,
    transitWindowEndsAt: transit
      ? new Date(transitWindowStart(segment).getTime() + HYBRID_TRANSIT_WINDOW_MS).toISOString()
      : null,
    transitExpired: isTransitExpired(segment, now),
  };
}

/**
 * Closes `current` (if any) and opens the next segment at `at`, atomically.
 *
 * Entering TRANSIT also ends any open geofence auto-pause at `at` and clears a
 * pending departure warning: from here the time is counted as transit, not as
 * a pause (otherwise the two would overlap), and with no geofence during
 * transit nothing else would ever resolve them. Entering OFFICE/HOME clears a
 * pending warning too, so a stale one from the previous place can't turn into
 * a pause against the new place. Timed-permission pauses are left alone —
 * they run on their own clock.
 *
 * Closing `current` is a compare-and-swap (only while it is still open), so
 * two racing requests (two pings, or a ping and a tap) can never both open a
 * next segment: the loser changes nothing and gets null back.
 */
export async function switchHybridSegment(params: {
  attendanceId: string;
  current: Pick<WorkSegment, "id"> | null;
  mode: "OFFICE" | "HOME" | "TRANSIT";
  heading?: HybridPlace | null;
  startMethod: WorkSegmentStartMethod;
  at: Date;
}): Promise<WorkSegment | null> {
  const { attendanceId, current, mode, startMethod, at } = params;
  return prisma.$transaction(async (tx) => {
    if (current) {
      const closed = await tx.workSegment.updateMany({
        where: { id: current.id, endedAt: null },
        data: { endedAt: at },
      });
      if (closed.count === 0) return null;
    }
    if (mode === "TRANSIT") {
      await tx.attendancePause.updateMany({
        where: { attendanceId, resumedAt: null, timedPermissionId: null, pausedAt: { lte: at } },
        data: { resumedAt: at },
      });
    }
    await tx.attendance.update({ where: { id: attendanceId }, data: { pauseWarningAt: null } });
    return tx.workSegment.create({
      data: {
        attendanceId,
        mode,
        heading: mode === "TRANSIT" ? (params.heading ?? null) : null,
        startedAt: at,
        startMethod,
      },
    });
  });
}
