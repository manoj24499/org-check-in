import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/pushNotifications";
import { combineISTDateAndTime, istDateKey, istTimeOfDay, startOfISTDay, todayDateOnlyIST } from "@/lib/istTime";

/** The "your shift is about to start" push goes out from this long before the shift start. */
export const BEFORE_START_LEAD_MS = 10 * 60 * 1000;
/** The "you have not checked in" push goes out this long after the shift start. */
export const AFTER_START_DELAY_MS = 5 * 60 * 1000;
/** ...and is dropped if the scheduler was down so long that it would arrive far too late. */
export const AFTER_START_MAX_MS = 60 * 60 * 1000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type ShiftReminderKind = "BEFORE_START" | "AFTER_START";

/** Which reminder (if any) is due at `now` for a shift starting at `start`. */
export function dueReminder(now: Date, start: Date): ShiftReminderKind | null {
  const t = now.getTime();
  const s = start.getTime();
  if (t >= s - BEFORE_START_LEAD_MS && t < s) return "BEFORE_START";
  if (t >= s + AFTER_START_DELAY_MS && t < s + AFTER_START_MAX_MS) return "AFTER_START";
  return null;
}

function formatIstTime(instant: Date): string {
  const { hours, minutes } = istTimeOfDay(instant);
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * Run by the 5-minute scheduler. For every employee with a shift assigned today:
 *  - from 10 minutes before the shift starts, a heads-up push (once);
 *  - 5 minutes after the start, if they still have not checked in, a "check in" push (once).
 * Nobody is reminded who has already checked in, has approved leave today, or whose
 * organization has a public holiday today. Employees with no shift entered for today are skipped.
 */
export async function runShiftStartReminders(
  now = new Date(),
  organizationId?: string,
): Promise<{ candidates: number; before: number; after: number }> {
  const weekday = new Date(now.getTime() + IST_OFFSET_MS).getUTCDay();
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      weekday,
      user: {
        active: true,
        role: "EMPLOYEE",
        organization: { status: "ACTIVE" },
        ...(organizationId ? { organizationId } : {}),
      },
    },
    select: { userId: true, shift: { select: { startTime: true } }, user: { select: { organizationId: true } } },
  });

  const due: { userId: string; organizationId: string; start: Date; kind: ShiftReminderKind }[] = [];
  for (const a of assignments) {
    const start = combineISTDateAndTime(now, a.shift.startTime);
    if (!start) continue;
    const kind = dueReminder(now, start);
    if (kind) due.push({ userId: a.userId, organizationId: a.user.organizationId, start, kind });
  }
  if (due.length === 0) return { candidates: 0, before: 0, after: 0 };

  const userIds = due.map((d) => d.userId);
  const dayKey = istDateKey(now);
  const today = todayDateOnlyIST();
  const [checkedIn, onLeave, holidays, sent] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: userIds }, type: "CHECK_IN", timestamp: { gte: startOfISTDay(now) } },
      select: { userId: true },
    }),
    prisma.timeOffRequest.findMany({
      where: { userId: { in: userIds }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      select: { userId: true },
    }),
    prisma.publicHoliday.findMany({
      where: { organizationId: { in: [...new Set(due.map((d) => d.organizationId))] }, date: today },
      select: { organizationId: true },
    }),
    prisma.shiftReminder.findMany({ where: { userId: { in: userIds }, dayKey }, select: { userId: true, kind: true } }),
  ]);
  const skipUsers = new Set([...checkedIn, ...onLeave].map((r) => r.userId));
  const holidayOrgs = new Set(holidays.map((h) => h.organizationId));
  const alreadySent = new Set(sent.map((s) => `${s.userId}:${s.kind}`));

  let before = 0;
  let after = 0;
  for (const d of due) {
    if (skipUsers.has(d.userId) || holidayOrgs.has(d.organizationId) || alreadySent.has(`${d.userId}:${d.kind}`)) continue;
    // Claim the reminder first, so two overlapping runs cannot both send it.
    try {
      await prisma.shiftReminder.create({ data: { userId: d.userId, dayKey, kind: d.kind } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    const time = formatIstTime(d.start);
    if (d.kind === "BEFORE_START") {
      await sendPushNotification(d.userId, "Your shift starts soon", `Your shift starts at ${time}. Remember to check in when you arrive.`);
      before++;
    } else {
      await sendPushNotification(d.userId, "Time to check in", `Your shift started at ${time} and you have not checked in yet.`);
      after++;
    }
  }
  return { candidates: due.length, before, after };
}
