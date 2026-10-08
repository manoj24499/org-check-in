import { prisma } from "@/lib/prisma";

/** A checked-in field worker who has sent no location for this long is "silent". */
export const SILENT_AFTER_MS = 10 * 60 * 1000;
/** Re-alert a still-silent worker no more than this often. */
export const REALERT_AFTER_MS = 30 * 60 * 1000;
/** Stop chasing after this long: the phone is probably off or left behind, and more alerts don't help. */
export const GIVE_UP_AFTER_MS = 6 * 60 * 60 * 1000;

export interface SilentFieldWorker {
  attendanceId: string;
  userId: string;
  name: string;
  employeeCode: string;
  organizationId: string;
  checkedInAt: Date;
  /** Latest location point since check-in, or null when none has ever arrived. */
  lastPingAt: Date | null;
  /** How long it has been since the last point (or since check-in if there is none). */
  silentMs: number;
  trackingAlertSentAt: Date | null;
}

/**
 * Field workers who are checked in on a Field-mode day but whose phone has stopped
 * sending location: the cause of the missing routes and distance (battery saver,
 * permission, app closed). Optionally limited to one organization.
 */
export async function findSilentFieldWorkers(organizationId?: string, now = new Date()): Promise<SilentFieldWorker[]> {
  const since = new Date(now.getTime() - 20 * 3600 * 1000);
  const checkIns = await prisma.attendance.findMany({
    where: {
      type: "CHECK_IN",
      checkInMode: "FIELD",
      timestamp: { gte: since },
      user: { active: true, role: "EMPLOYEE", ...(organizationId ? { organizationId } : {}) },
    },
    select: {
      id: true,
      userId: true,
      timestamp: true,
      trackingAlertSentAt: true,
      user: { select: { name: true, employeeCode: true, organizationId: true } },
    },
  });
  if (checkIns.length === 0) return [];

  const userIds = [...new Set(checkIns.map((c) => c.userId))];
  const [checkOuts, lastPings] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["userId"],
      _max: { timestamp: true },
      where: { type: "CHECK_OUT", userId: { in: userIds }, timestamp: { gte: since } },
    }),
    prisma.locationPing.groupBy({
      by: ["userId"],
      _max: { timestamp: true },
      where: { userId: { in: userIds }, timestamp: { gte: since } },
    }),
  ]);
  const outAt = new Map(checkOuts.map((o) => [o.userId, o._max.timestamp]));
  const pingAt = new Map(lastPings.map((p) => [p.userId, p._max.timestamp]));

  const silent: SilentFieldWorker[] = [];
  for (const c of checkIns) {
    const out = outAt.get(c.userId);
    if (out && out > c.timestamp) continue; // already checked out
    const ping = pingAt.get(c.userId);
    const lastPingAt = ping && ping >= c.timestamp ? ping : null;
    const last = lastPingAt ?? c.timestamp;
    const silentMs = now.getTime() - last.getTime();
    if (silentMs < SILENT_AFTER_MS) continue;
    silent.push({
      attendanceId: c.id,
      userId: c.userId,
      name: c.user.name,
      employeeCode: c.user.employeeCode,
      organizationId: c.user.organizationId,
      checkedInAt: c.timestamp,
      lastPingAt,
      silentMs,
      trackingAlertSentAt: c.trackingAlertSentAt,
    });
  }
  return silent.sort((a, b) => b.silentMs - a.silentMs);
}
