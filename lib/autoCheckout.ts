import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/pushNotifications";
import { istDateKey, istTimeOfDay } from "@/lib/istTime";
import { combineDateAndShiftEndTime } from "@/lib/shiftTime";
import { computeTotalDistanceMeters } from "@/lib/locationClustering";

/** How long after the shift ends a still-checked-in employee gets the "please check out" push. */
export const AUTO_CHECKOUT_WARN_AFTER_MS = 10 * 60 * 1000;
/** How long after that push, with no response, they are checked out automatically. */
export const AUTO_CHECKOUT_GRACE_MS = 5 * 60 * 1000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type AutoCheckoutDecision = "wait" | "warn" | "checkout";

/**
 * What to do with one open session right now. `target` is when the employee was
 * expected to be done (shift end, or the end time of an active overtime request).
 * The warning always comes first, even if the scheduler was down and the deadline
 * has long passed, and a warning sent for an earlier target does not count.
 */
export function decideAutoCheckout(input: {
  now: Date;
  target: Date;
  checkInAt: Date;
  warnedAt: Date | null;
}): AutoCheckoutDecision {
  const { now, target, checkInAt, warnedAt } = input;
  // Checked in at or after the shift end (a late or out-of-hours start): there is
  // no shift end to count from, so leave it to the employee or the admin.
  if (checkInAt >= target) return "wait";
  const warnDue = target.getTime() + AUTO_CHECKOUT_WARN_AFTER_MS;
  if (now.getTime() < warnDue) return "wait";
  const warnedForThisTarget = warnedAt && warnedAt.getTime() >= warnDue;
  if (!warnedForThisTarget) return "warn";
  return now.getTime() - warnedAt.getTime() >= AUTO_CHECKOUT_GRACE_MS ? "checkout" : "wait";
}

function formatIstTime(instant: Date): string {
  const { hours, minutes } = istTimeOfDay(instant);
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * End odometer for a worker who never entered one: the start km plus the GPS distance
 * travelled between check-in and the check-out time, leaving out time spent in Office
 * mode (indoor GPS wobble is not travel). Null when there is no usable track, so no
 * reading is invented.
 */
async function estimateEndKm(attendanceId: string, userId: string, startKm: number, from: Date, to: Date): Promise<number | null> {
  const [pings, segments] = await Promise.all([
    prisma.locationPing.findMany({
      where: { userId, timestamp: { gte: from, lte: to } },
      orderBy: { timestamp: "asc" },
      select: { latitude: true, longitude: true, timestamp: true, accuracy: true },
    }),
    prisma.workSegment.findMany({
      where: { attendanceId, mode: "OFFICE" },
      select: { startedAt: true, endedAt: true },
    }),
  ]);
  const inOffice = (t: Date) => segments.some((s) => t >= s.startedAt && (!s.endedAt || t < s.endedAt));
  const fieldPings = pings.filter((p) => !inOffice(p.timestamp));
  if (fieldPings.length < 2) return null;
  const km = computeTotalDistanceMeters(fieldPings) / 1000;
  return Math.round((startKm + km) * 10) / 10;
}

/**
 * Run by the 5-minute scheduler. For every employee who is still checked in after their
 * shift ended: 10 minutes after the shift end send a push asking them to check out, and
 * if they still have not 5 minutes later, check them out automatically. Only employees
 * with a shift assigned for that day are considered (an active overtime request moves
 * the end to its own end time), and nobody is touched while on an approved permission.
 * The check-out is recorded at the shift end, so working hours stop where the shift did.
 * A field worker who entered a start km gets an end km worked out for them (start plus the
 * GPS distance travelled in Field mode), flagged as an estimate, so the reimbursement can
 * still be calculated.
 */
export async function runAutoCheckout(
  now = new Date(),
  organizationId?: string,
): Promise<{ checked: number; warned: number; checkedOut: number }> {
  const since = new Date(now.getTime() - 36 * 3600 * 1000);
  const open = await prisma.attendance.findMany({
    where: {
      type: "CHECK_IN",
      timestamp: { gte: since },
      user: { active: true, role: "EMPLOYEE", organization: { status: "ACTIVE" }, ...(organizationId ? { organizationId } : {}) },
    },
    select: {
      id: true,
      userId: true,
      timestamp: true,
      odometerKm: true,
      autoCheckoutWarnedAt: true,
      pauses: { where: { resumedAt: null, timedPermissionId: { not: null } }, select: { id: true } },
    },
  });
  if (open.length === 0) return { checked: 0, warned: 0, checkedOut: 0 };

  const userIds = [...new Set(open.map((c) => c.userId))];
  const [checkOuts, assignments, overtime] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["userId"],
      _max: { timestamp: true },
      where: { type: "CHECK_OUT", userId: { in: userIds }, timestamp: { gte: since } },
    }),
    prisma.shiftAssignment.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, weekday: true, shift: { select: { startTime: true, endTime: true } } },
    }),
    prisma.overtimeRequest.findMany({
      where: { attendanceId: { in: open.map((c) => c.id) }, submittedAt: null },
      orderBy: { createdAt: "desc" },
      select: { attendanceId: true, estimatedEndAt: true },
    }),
  ]);
  const outAt = new Map(checkOuts.map((o) => [o.userId, o._max.timestamp]));
  const shiftByUserDay = new Map(assignments.map((a) => [`${a.userId}:${a.weekday}`, a.shift]));
  const overtimeEnd = new Map<string, Date>();
  for (const o of overtime) if (!overtimeEnd.has(o.attendanceId)) overtimeEnd.set(o.attendanceId, o.estimatedEndAt);

  let warned = 0;
  let checkedOut = 0;
  for (const c of open) {
    const out = outAt.get(c.userId);
    if (out && out > c.timestamp) continue; // already checked out
    if (c.pauses.length > 0) continue; // on an approved permission

    // Weekday of the check-in in IST (ShiftAssignment.weekday: 0 = Sunday).
    const weekday = new Date(c.timestamp.getTime() + IST_OFFSET_MS).getUTCDay();
    const shift = shiftByUserDay.get(`${c.userId}:${weekday}`) ?? null;
    const target = overtimeEnd.get(c.id) ?? (shift ? combineDateAndShiftEndTime(c.timestamp, shift) : null);
    if (!target) continue; // no shift entered for that day: nothing to count from

    const decision = decideAutoCheckout({ now, target, checkInAt: c.timestamp, warnedAt: c.autoCheckoutWarnedAt });
    if (decision === "wait") continue;

    if (decision === "warn") {
      // Claim the warning first so two overlapping runs cannot both send it.
      const claimed = await prisma.attendance.updateMany({
        where: { id: c.id, autoCheckoutWarnedAt: c.autoCheckoutWarnedAt },
        data: { autoCheckoutWarnedAt: now },
      });
      if (claimed.count === 0) continue;
      await sendPushNotification(
        c.userId,
        "Your shift has ended",
        "You are still checked in. Please check out now, or you will be checked out automatically in 5 minutes.",
      );
      warned++;
      continue;
    }

    const endKm = c.odometerKm != null ? await estimateEndKm(c.id, c.userId, c.odometerKm, c.timestamp, target) : null;

    try {
      await prisma.$transaction([
        prisma.attendance.create({
          data: {
            userId: c.userId,
            type: "CHECK_OUT",
            method: "AUTO",
            timestamp: target,
            dayKey: istDateKey(target),
            ...(endKm != null ? { odometerKm: endKm, odometerEstimated: true } : {}),
          },
        }),
        prisma.attendancePause.updateMany({ where: { attendanceId: c.id, resumedAt: null }, data: { resumedAt: target } }),
        prisma.attendance.update({ where: { id: c.id }, data: { pauseWarningAt: null } }),
        prisma.workSegment.updateMany({ where: { attendanceId: c.id, endedAt: null }, data: { endedAt: target } }),
        prisma.overtimeRequest.updateMany({
          where: { attendanceId: c.id, submittedAt: null },
          data: { submittedAt: target },
        }),
      ]);
    } catch (err) {
      // Something already holds this day's check-out slot (a manual check-out that
      // raced this run, or older data): leave the record as it is.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    checkedOut++;
    await sendPushNotification(
      c.userId,
      "You were checked out automatically",
      `Your shift ended at ${formatIstTime(target)}, so your check-out was recorded then.${endKm != null ? " Your end km was worked out from your tracked distance." : ""} Tell your admin if this is wrong.`,
    );
  }
  return { checked: open.length, warned, checkedOut };
}
