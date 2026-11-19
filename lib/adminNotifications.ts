import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { checkFaceVerifyHealth, happenedWithin } from "@/lib/faceVerify";
import { istDateKey, startOfISTDay } from "@/lib/istTime";
import { findSilentFieldWorkers, type SilentFieldWorker } from "@/lib/trackingWatch";
import { findStationaryFieldWorkers } from "@/lib/stationaryWatch";

// The alerts an admin sees on the dashboard, gathered in one place for the Notifications page and the
// sidebar badge. They are worked out from live data each time; the only thing stored is which ones an
// admin deleted (DismissedNotification), so the dashboard cards and the face-service banner can hide
// the same ones.

export type NotificationKind =
  | "PERMISSION_REQUEST"
  | "OUTSIDE_AREA"
  | "TRACKING_STOPPED"
  | "PHONE_STILL"
  | "NEW_PHONE"
  | "MEETING"
  | "FACE_SERVICE"
  | "FACE_MISSED";

export interface AdminNotification {
  /** Identifies this occurrence. Deleting it hides exactly this one. */
  key: string;
  kind: NotificationKind;
  title: string;
  message: string;
  /** When it happened (ISO), used to sort and to show the time. */
  occurredAt: string;
  employee?: { id: string; name: string; employeeCode: string };
  /** False for requests that need a decision: they go away when approved or declined, not when deleted. */
  dismissible: boolean;
  permission?: { id: string; startTime: string; endTime: string };
}

const KEY_PATTERN = /^(tracking|face|facesvc|outside|still|phone|meeting):[A-Za-z0-9:_.\-]{1,100}$/;
/** Only these keys can be dismissed through the API. */
export function isDismissibleKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

const minute = (d: Date) => d.toISOString().slice(0, 16);

/** One field worker whose phone went quiet. A fresh silence (a later last ping) gets a new key. */
export function trackingKey(w: Pick<SilentFieldWorker, "attendanceId" | "lastPingAt" | "checkedInAt">): string {
  return `tracking:${w.attendanceId}:${minute(w.lastPingAt ?? w.checkedInAt)}`;
}

/** One departure from the working area: a new departure (a new pause) gets a new key and alerts again. */
export function outsideKey(pauseId: string): string {
  return `outside:${pauseId}`;
}

/** One check-in session whose phone has not moved. Once per session, however long it stays still. */
export function stillKey(attendanceId: string): string {
  return `still:${attendanceId}`;
}

/** One attempt to sign in from a phone that isn't the registered one. A new attempt gets a new key. */
export function newPhoneKey(userId: string, attemptedAt: Date): string {
  return `phone:${userId}:${minute(attemptedAt)}`;
}

/** One check-in that went through without a face check. */
export function faceMissedKey(attendanceId: string): string {
  return `face:${attendanceId}`;
}

/** The face-service banner for one day. */
export function faceServiceKey(now = new Date()): string {
  return `facesvc:${istDateKey(now)}`;
}

/** Remembered deletions are only useful while the alert they hid could still appear, so old ones are cleared. */
export async function pruneOldDismissals(organizationId: string): Promise<void> {
  await prisma.dismissedNotification
    .deleteMany({ where: { organizationId, createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } })
    .catch(() => undefined);
}

export async function getDismissedKeys(organizationId: string): Promise<Set<string>> {
  const rows = await prisma.dismissedNotification.findMany({ where: { organizationId }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

/**
 * Everything currently worth an admin's attention, minus what they have deleted, newest first within
 * each group (requests that need a decision come first). Pass `faceStatus` if the caller already
 * checked the face service, to avoid asking twice.
 */
export async function getAdminNotifications(
  organizationId: string,
  options: { faceStatus?: "ok" | "unreachable" | "not_configured"; includeDismissed?: boolean } = {},
): Promise<AdminNotification[]> {
  const now = new Date();
  const since7d = new Date(startOfISTDay(now).getTime() - 6 * 24 * 3600 * 1000);

  const settings = await getSettings(organizationId);
  const outsideMs = settings.outsideAlertMinutes * 60_000;

  const [dismissed, permissions, silent, missed, faceStatus, unavailableToday, outside, still, newPhones, meetings] = await Promise.all([
    options.includeDismissed ? Promise.resolve(new Set<string>()) : getDismissedKeys(organizationId),
    prisma.timedPermission.findMany({
      where: { approvalStatus: "PENDING", attendance: { user: { organizationId } } },
      orderBy: { createdAt: "asc" },
      include: { attendance: { select: { user: { select: { id: true, employeeCode: true, name: true } } } } },
    }),
    findSilentFieldWorkers(organizationId, now),
    prisma.attendance.findMany({
      where: { type: "CHECK_IN", faceVerifyStatus: "UNAVAILABLE", timestamp: { gte: since7d }, user: { organizationId } },
      orderBy: { timestamp: "desc" },
      take: 100,
      select: { id: true, timestamp: true, user: { select: { id: true, name: true, employeeCode: true } } },
    }),
    options.faceStatus ? Promise.resolve(options.faceStatus) : checkFaceVerifyHealth(),
    prisma.attendance.aggregate({
      _count: true,
      _max: { timestamp: true },
      where: { faceVerifyStatus: "UNAVAILABLE", timestamp: { gte: startOfISTDay(now) }, user: { organizationId } },
    }),
    // Still outside the area (an open pause from leaving the geofence, not an approved permission window) for
    // at least the configured time. Pauses older than 16 hours are leftovers of a session that was never
    // closed, not someone actually out.
    outsideMs > 0
      ? prisma.attendancePause.findMany({
          where: {
            resumedAt: null,
            timedPermissionId: null,
            pausedAt: { lte: new Date(now.getTime() - outsideMs), gte: new Date(now.getTime() - 16 * 3600 * 1000) },
            attendance: { user: { organizationId, active: true } },
          },
          orderBy: { pausedAt: "asc" },
          select: { id: true, pausedAt: true, attendance: { select: { user: { select: { id: true, name: true, employeeCode: true } } } } },
        })
      : Promise.resolve([]),
    findStationaryFieldWorkers(organizationId, now),
    // A phone that tried to sign in and was refused, still waiting for the admin to approve it.
    prisma.user.findMany({
      where: { organizationId, active: true, pendingDeviceId: { not: null }, pendingDeviceAt: { gte: new Date(now.getTime() - 14 * 24 * 3600 * 1000) } },
      select: { id: true, name: true, employeeCode: true, pendingDeviceLabel: true, pendingDeviceAt: true },
    }),
    // Meetings employees declared outside their shift. Nothing to approve: this is the "heads up".
    prisma.meeting.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 3 * 24 * 3600 * 1000) }, endAt: { gte: now }, user: { organizationId, active: true } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, startAt: true, endAt: true, createdAt: true, user: { select: { id: true, name: true, employeeCode: true } } },
    }),
  ]);

  const out: AdminNotification[] = [];

  for (const p of permissions) {
    out.push({
      key: `permission:${p.id}`,
      kind: "PERMISSION_REQUEST",
      title: "Permission request",
      message: "Asked for a timed pause. Nothing changes for them until you approve or decline.",
      occurredAt: p.createdAt.toISOString(),
      employee: p.attendance.user,
      dismissible: false,
      permission: { id: p.id, startTime: p.startTime.toISOString(), endTime: p.endTime.toISOString() },
    });
  }

  const timeIST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
  for (const p of outside) {
    const key = outsideKey(p.id);
    if (dismissed.has(key)) continue;
    const mins = Math.round((now.getTime() - p.pausedAt.getTime()) / 60000);
    out.push({
      key,
      kind: "OUTSIDE_AREA",
      title: "Outside the working area",
      message: `${p.attendance.user.name} has been outside their working area for ${mins} min (since ${timeIST.format(p.pausedAt)}). Their time isn't counting while they are out.`,
      occurredAt: p.pausedAt.toISOString(),
      employee: p.attendance.user,
      dismissible: true,
    });
  }

  for (const w of silent) {
    const key = trackingKey(w);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      kind: "TRACKING_STOPPED",
      title: "Tracking stopped",
      message: w.lastPingAt
        ? `Checked in on a field day, but the phone stopped sending location ${Math.round(w.silentMs / 60000)} min ago. Their route and distance are not being recorded.`
        : `Checked in on a field day, but no location has arrived since check-in (${Math.round(w.silentMs / 60000)} min).`,
      occurredAt: (w.lastPingAt ?? w.checkedInAt).toISOString(),
      employee: { id: w.userId, name: w.name, employeeCode: w.employeeCode },
      dismissible: true,
    });
  }

  for (const s of still) {
    const key = stillKey(s.attendanceId);
    if (dismissed.has(key)) continue;
    const mins = Math.round((now.getTime() - s.since.getTime()) / 60000);
    out.push({
      key,
      kind: "PHONE_STILL",
      title: "Phone hasn't moved",
      message: `Checked in on a field day, but the phone has stayed within ${Math.max(s.spreadMeters, 1)} m of one spot for ${mins} min (${s.points} location points${
        s.identicalCoordinates ? ", all with identical coordinates, which real GPS rarely gives" : ""
      }). They may just be at one site, or the phone may have been left behind.`,
      occurredAt: s.since.toISOString(),
      employee: { id: s.userId, name: s.name, employeeCode: s.employeeCode },
      dismissible: true,
    });
  }

  for (const u of newPhones) {
    if (!u.pendingDeviceAt) continue;
    const key = newPhoneKey(u.id, u.pendingDeviceAt);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      kind: "NEW_PHONE",
      title: "Sign-in from a different phone",
      message: `${u.name} tried to sign in on ${u.pendingDeviceLabel ?? "an unknown phone"}, which isn't their registered phone, and was refused. Open their profile to approve it if they really changed phones.`,
      occurredAt: u.pendingDeviceAt.toISOString(),
      employee: { id: u.id, name: u.name, employeeCode: u.employeeCode },
      dismissible: true,
    });
  }

  const dayTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  for (const m of meetings) {
    const key = `meeting:${m.id}`;
    if (dismissed.has(key)) continue;
    out.push({
      key,
      kind: "MEETING",
      title: "Meeting outside shift hours",
      message: `“${m.title}”, ${dayTime.format(m.startAt)} to ${timeIST.format(m.endAt)}. Logged by the employee; nothing to approve. They won't be reminded or checked out automatically while it runs.`,
      occurredAt: m.createdAt.toISOString(),
      employee: m.user,
      dismissible: true,
    });
  }

  const recentlyMissed = happenedWithin(unavailableToday._max.timestamp?.toISOString() ?? null, 30 * 60 * 1000);
  const serviceKey = faceServiceKey(now);
  if ((faceStatus !== "ok" || (unavailableToday._count > 0 && recentlyMissed)) && !dismissed.has(serviceKey)) {
    out.push({
      key: serviceKey,
      kind: "FACE_SERVICE",
      title: faceStatus !== "ok" ? "Face verification is unreachable" : "Check-ins skipped face verification",
      message:
        faceStatus !== "ok"
          ? "Check-ins are still being accepted, but without face verification, until the service is reachable again."
          : `${unavailableToday._count} check-in${unavailableToday._count === 1 ? "" : "s"} today went through without face verification because the service was briefly unreachable.`,
      occurredAt: (unavailableToday._max.timestamp ?? now).toISOString(),
      dismissible: true,
    });
  }

  for (const m of missed) {
    const key = faceMissedKey(m.id);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      kind: "FACE_MISSED",
      title: "Missed face check",
      message: "This check-in went through without a face check because the face service could not be reached at that moment.",
      occurredAt: m.timestamp.toISOString(),
      employee: m.user,
      dismissible: true,
    });
  }

  const rank: Record<NotificationKind, number> = { PERMISSION_REQUEST: 0, OUTSIDE_AREA: 1, TRACKING_STOPPED: 2, NEW_PHONE: 3, PHONE_STILL: 4, MEETING: 5, FACE_SERVICE: 6, FACE_MISSED: 7 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || b.occurredAt.localeCompare(a.occurredAt));
}
