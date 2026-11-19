import { prisma } from "@/lib/prisma";
import { haversineDistanceMeters } from "@/lib/geofence";

/**
 * Field workers whose phone has not moved: checked in on a Field day, yet every location point for the
 * last couple of hours is within a few metres of the same spot. That is what a phone left at home (or on a
 * desk) while its owner works elsewhere looks like. It can also be an honest long stop at one client site,
 * so this is only ever an alert for an admin to look at, never a block.
 *
 * Office and work-from-home days are not checked: sitting still is normal there. Hybrid is skipped too,
 * since a day split between office and home is mostly stationary by design.
 */

/** Look at the points from the last this-long. */
export const STATIONARY_WINDOW_MS = 2 * 60 * 60 * 1000;
/** The points must span at least this much of that window, or there isn't enough evidence yet. */
export const STATIONARY_MIN_SPAN_MS = 90 * 60 * 1000;
/** Fewer points than this and a quiet phone looks the same as a still one. */
export const STATIONARY_MIN_POINTS = 4;
/** Every point within this distance of the group's centre counts as "same spot" (GPS drifts indoors). */
export const STATIONARY_RADIUS_METERS = 40;

export interface StationaryWorker {
  attendanceId: string;
  userId: string;
  name: string;
  employeeCode: string;
  checkedInAt: Date;
  /** When the still stretch began (the first point in the window). */
  since: Date;
  points: number;
  /** Largest distance of any point from the centre, metres. */
  spreadMeters: number;
  /** Every point reported the exact same coordinates, which real GPS almost never does. */
  identicalCoordinates: boolean;
}

export async function findStationaryFieldWorkers(organizationId: string, now = new Date()): Promise<StationaryWorker[]> {
  const checkIns = await prisma.attendance.findMany({
    where: {
      type: "CHECK_IN",
      checkInMode: "FIELD",
      timestamp: { gte: new Date(now.getTime() - 20 * 3600 * 1000) },
      user: { active: true, role: "EMPLOYEE", organizationId },
    },
    select: { id: true, userId: true, timestamp: true, user: { select: { name: true, employeeCode: true } } },
  });
  if (checkIns.length === 0) return [];

  const userIds = [...new Set(checkIns.map((c) => c.userId))];
  const windowStart = new Date(now.getTime() - STATIONARY_WINDOW_MS);
  const [checkOuts, pings] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["userId"],
      _max: { timestamp: true },
      where: { type: "CHECK_OUT", userId: { in: userIds }, timestamp: { gte: new Date(now.getTime() - 20 * 3600 * 1000) } },
    }),
    prisma.locationPing.findMany({
      where: { userId: { in: userIds }, isTrail: false, timestamp: { gte: windowStart } },
      orderBy: { timestamp: "asc" },
      select: { userId: true, latitude: true, longitude: true, timestamp: true },
    }),
  ]);
  const outAt = new Map(checkOuts.map((o) => [o.userId, o._max.timestamp]));
  const byUser = new Map<string, typeof pings>();
  for (const p of pings) {
    const list = byUser.get(p.userId);
    if (list) list.push(p);
    else byUser.set(p.userId, [p]);
  }

  const found: StationaryWorker[] = [];
  for (const c of checkIns) {
    const out = outAt.get(c.userId);
    if (out && out > c.timestamp) continue; // already checked out

    // Only points from this check-in session, inside the window.
    const mine = (byUser.get(c.userId) ?? []).filter((p) => p.timestamp >= c.timestamp);
    if (mine.length < STATIONARY_MIN_POINTS) continue;
    const span = mine[mine.length - 1].timestamp.getTime() - mine[0].timestamp.getTime();
    if (span < STATIONARY_MIN_SPAN_MS) continue;

    const lat = mine.reduce((s, p) => s + p.latitude, 0) / mine.length;
    const lon = mine.reduce((s, p) => s + p.longitude, 0) / mine.length;
    const spread = Math.max(...mine.map((p) => haversineDistanceMeters(lat, lon, p.latitude, p.longitude)));
    if (spread > STATIONARY_RADIUS_METERS) continue;

    const identical = mine.every((p) => p.latitude === mine[0].latitude && p.longitude === mine[0].longitude);
    found.push({
      attendanceId: c.id,
      userId: c.userId,
      name: c.user.name,
      employeeCode: c.user.employeeCode,
      checkedInAt: c.timestamp,
      since: mine[0].timestamp,
      points: mine.length,
      spreadMeters: Math.round(spread),
      identicalCoordinates: identical,
    });
  }
  return found;
}
