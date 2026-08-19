import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export type TimeOffType = "CASUAL" | "SICK" | "EARNED";

const LEAVE_TYPES: TimeOffType[] = ["CASUAL", "SICK", "EARNED"];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Every calendar date from start to end inclusive, at local midnight. */
function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur.getTime() <= last.getTime()) {
    dates.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Calendar days in [start, end] minus any PublicHoliday dates. See
 * TimeOffRequest.days for why this is snapshotted at submission time rather
 * than recomputed later. */
export async function countLeaveDays(start: Date, end: Date): Promise<number> {
  const dates = enumerateDates(start, end);
  if (dates.length === 0) return 0;

  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: dates[0], lte: dates[dates.length - 1] } },
  });
  const holidaySet = new Set(holidays.map((h) => startOfDay(h.date).getTime()));

  return dates.filter((d) => !holidaySet.has(d.getTime())).length;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TYPE_LABEL: Record<TimeOffType, string> = {
  CASUAL: "Casual leave",
  SICK: "Sick leave",
  EARNED: "Earned leave",
};

export interface CalendarSpecialDay {
  kind: "holiday" | "leave";
  label: string;
}

/**
 * Per-date lookup, keyed "YYYY-MM-DD", of "this day is a public holiday" or
 * "this day is this employee's approved leave" — for the attendance
 * calendars (admin employee detail, my-page, admin dashboard quick view) to
 * tell those apart from a genuine gap in attendance, which today renders
 * identically to either. Holiday wins if a day is somehow both (matches
 * countLeaveDays treating a holiday as the stronger classification — it's
 * excluded from the leave day count too).
 */
export async function getCalendarSpecialDays(userId: string): Promise<Record<string, CalendarSpecialDay>> {
  const [holidays, approvedLeave] = await Promise.all([
    prisma.publicHoliday.findMany(),
    prisma.timeOffRequest.findMany({ where: { userId, status: "APPROVED" } }),
  ]);

  const map: Record<string, CalendarSpecialDay> = {};
  for (const r of approvedLeave) {
    for (const d of enumerateDates(r.startDate, r.endDate)) {
      map[dateKey(d)] = { kind: "leave", label: TYPE_LABEL[r.type] };
    }
  }
  for (const h of holidays) {
    map[dateKey(h.date)] = { kind: "holiday", label: h.name };
  }
  return map;
}

const QUOTA_FIELD = {
  CASUAL: "casualLeaveQuota",
  SICK: "sickLeaveQuota",
  EARNED: "earnedLeaveQuota",
} as const;

export interface LeaveBalance {
  type: TimeOffType;
  quota: number;
  used: number;
  remaining: number;
}

/** This calendar year's approved-days-used and remaining balance, per leave
 * type, for one employee — always derived from APPROVED TimeOffRequest rows
 * rather than a stored running counter, so a later quota change (see
 * AppSettings) never has to rewrite anyone's history. */
export async function getLeaveBalances(userId: string): Promise<LeaveBalance[]> {
  const settings = await getSettings();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const approved = await prisma.timeOffRequest.findMany({
    where: { userId, status: "APPROVED", startDate: { gte: yearStart, lt: yearEnd } },
  });

  return LEAVE_TYPES.map((type) => {
    const used = approved
      .filter((r) => r.type === type)
      .reduce((sum, r) => sum + r.days, 0);
    const quota = settings[QUOTA_FIELD[type]];
    return { type, quota, used, remaining: Math.max(0, quota - used) };
  });
}
