import { prisma } from "@/lib/prisma";

const IST_TIMEZONE = "Asia/Kolkata";

/** Plain UTC-calendar-date key, "YYYY-MM-DD" — same convention as
 * lib/timeOff.ts's own local `dateKey`, used for the same reason: every
 * date-only field in this app (PublicHoliday.date, TimeOffRequest.startDate/
 * endDate, Attendance.dayKey) is encoded as UTC midnight of that calendar
 * date, so formatting via UTC getters (never local getters) is what stays
 * correct regardless of the server's own timezone. */
function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dateOnlyFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function enumerateDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur.getTime() <= last.getTime()) {
    keys.push(dateKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

export type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "WEEKLY_OFF";

export interface AttendanceRecord {
  id: string;
  employeeCode: string;
  workDate: string;
  timezone: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  status: AttendanceStatus;
  dayFraction: 0 | 0.5 | 1;
  leaveTypeCode: string | null;
  secondHalf: { status: AttendanceStatus; leaveTypeCode: string | null } | null;
  // No general "attendance approval" concept exists in this app (only leave
  // and overtime requests are reviewed) — every synthesized/real day defaults
  // to "approved" since there's no pending step for plain attendance. See the
  // response doc's gap note on this field.
  approvalStatus: "approved";
  punches?: { type: "in" | "out"; at: string }[];
  updatedAt: string;
}

interface PauseInterval {
  pausedAt: Date;
  resumedAt: Date | null;
}

interface AttendanceCell {
  checkIn?: { timestamp: Date; leaveType: string };
  checkOut?: { timestamp: Date };
  pauses: PauseInterval[];
}

interface Ctx {
  attendanceByUserDay: Map<string, AttendanceCell>;
  holidayNameByDay: Map<string, string>;
  leaveTypeByUserDay: Map<string, string>;
  weekdaysAssignedByUser: Map<string, Set<number>>;
}

function pauseMinutes(pauses: PauseInterval[]): number {
  let total = 0;
  for (const p of pauses) {
    if (!p.resumedAt) continue;
    total += (p.resumedAt.getTime() - p.pausedAt.getTime()) / 60_000;
  }
  return Math.round(total);
}

async function loadContext(
  organizationId: string,
  userIds: string[],
  from: Date,
  to: Date,
): Promise<Ctx> {
  if (userIds.length === 0) {
    return {
      attendanceByUserDay: new Map(),
      holidayNameByDay: new Map(),
      leaveTypeByUserDay: new Map(),
      weekdaysAssignedByUser: new Map(),
    };
  }

  const [attendanceRows, holidays, leaves, assignments] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: userIds }, dayKey: { gte: dateKey(from), lte: dateKey(to) } },
      select: {
        userId: true,
        type: true,
        dayKey: true,
        timestamp: true,
        leaveType: true,
        pauses: { select: { pausedAt: true, resumedAt: true } },
      },
    }),
    prisma.publicHoliday.findMany({
      where: { organizationId, date: { gte: from, lte: to } },
      select: { date: true, name: true },
    }),
    prisma.timeOffRequest.findMany({
      where: { userId: { in: userIds }, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
      select: { userId: true, type: true, startDate: true, endDate: true },
    }),
    prisma.shiftAssignment.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, weekday: true },
    }),
  ]);

  const attendanceByUserDay = new Map<string, AttendanceCell>();
  for (const row of attendanceRows) {
    const key = `${row.userId}:${row.dayKey}`;
    const cell = attendanceByUserDay.get(key) ?? { pauses: [] };
    if (row.type === "CHECK_IN") cell.checkIn = { timestamp: row.timestamp, leaveType: row.leaveType };
    if (row.type === "CHECK_OUT") cell.checkOut = { timestamp: row.timestamp };
    cell.pauses.push(...row.pauses);
    attendanceByUserDay.set(key, cell);
  }

  const holidayNameByDay = new Map(holidays.map((h) => [dateKey(h.date), h.name]));

  const leaveTypeByUserDay = new Map<string, string>();
  for (const leave of leaves) {
    const rangeStart = leave.startDate > from ? leave.startDate : from;
    const rangeEnd = leave.endDate < to ? leave.endDate : to;
    for (const key of enumerateDateKeys(rangeStart, rangeEnd)) {
      leaveTypeByUserDay.set(`${leave.userId}:${key}`, leave.type);
    }
  }

  const weekdaysAssignedByUser = new Map<string, Set<number>>();
  for (const a of assignments) {
    const set = weekdaysAssignedByUser.get(a.userId) ?? new Set<number>();
    set.add(a.weekday);
    weekdaysAssignedByUser.set(a.userId, set);
  }

  return { attendanceByUserDay, holidayNameByDay, leaveTypeByUserDay, weekdaysAssignedByUser };
}

function buildRecord(
  user: { id: string; employeeCode: string },
  day: string,
  ctx: Ctx,
  includePunches: boolean,
): AttendanceRecord {
  const id = `att_${user.employeeCode}_${day}`;
  const cell = ctx.attendanceByUserDay.get(`${user.id}:${day}`);
  const holidayName = ctx.holidayNameByDay.get(day);
  const leaveTypeCode = ctx.leaveTypeByUserDay.get(`${user.id}:${day}`);

  if (cell?.checkIn) {
    const checkInAt = cell.checkIn.timestamp;
    const checkOutAt = cell.checkOut?.timestamp ?? null;
    const workedMinutes = checkOutAt
      ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000) - pauseMinutes(cell.pauses))
      : 0;
    const isHalfDay = cell.checkIn.leaveType === "HALF_DAY";
    const secondHalf = isHalfDay && leaveTypeCode ? { status: "ON_LEAVE" as const, leaveTypeCode } : null;
    const updatedAt = checkOutAt && checkOutAt.getTime() > checkInAt.getTime() ? checkOutAt : checkInAt;

    return {
      id,
      employeeCode: user.employeeCode,
      workDate: day,
      timezone: IST_TIMEZONE,
      checkIn: checkInAt.toISOString(),
      checkOut: checkOutAt ? checkOutAt.toISOString() : null,
      workedMinutes,
      status: isHalfDay ? "HALF_DAY" : "PRESENT",
      dayFraction: isHalfDay ? 0.5 : 1,
      leaveTypeCode: null,
      secondHalf,
      approvalStatus: "approved",
      ...(includePunches
        ? {
            punches: [
              { type: "in" as const, at: checkInAt.toISOString() },
              ...(checkOutAt ? [{ type: "out" as const, at: checkOutAt.toISOString() }] : []),
            ],
          }
        : {}),
      updatedAt: updatedAt.toISOString(),
    };
  }

  // Every branch below is a synthesized day — no Attendance row exists at
  // all, so there is nothing with a real "last changed" time. The start of
  // that calendar day is used as a stable, if uninformative, placeholder
  // (see the response doc: no-punch days simply have no record today).
  const placeholderUpdatedAt = dateOnlyFromKey(day).toISOString();

  if (holidayName) {
    return {
      id, employeeCode: user.employeeCode, workDate: day, timezone: IST_TIMEZONE,
      checkIn: null, checkOut: null, workedMinutes: 0,
      status: "HOLIDAY", dayFraction: 1, leaveTypeCode: null, secondHalf: null,
      approvalStatus: "approved", updatedAt: placeholderUpdatedAt,
    };
  }

  if (leaveTypeCode) {
    return {
      id, employeeCode: user.employeeCode, workDate: day, timezone: IST_TIMEZONE,
      checkIn: null, checkOut: null, workedMinutes: 0,
      status: "ON_LEAVE", dayFraction: 1, leaveTypeCode, secondHalf: null,
      approvalStatus: "approved", updatedAt: placeholderUpdatedAt,
    };
  }

  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const hasShiftThatDay = ctx.weekdaysAssignedByUser.get(user.id)?.has(weekday) ?? false;
  const status: AttendanceStatus = hasShiftThatDay ? "ABSENT" : "WEEKLY_OFF";

  return {
    id, employeeCode: user.employeeCode, workDate: day, timezone: IST_TIMEZONE,
    checkIn: null, checkOut: null, workedMinutes: 0,
    status, dayFraction: status === "ABSENT" ? 1 : 0, leaveTypeCode: null, secondHalf: null,
    approvalStatus: "approved", updatedAt: placeholderUpdatedAt,
  };
}

export interface RangeQuery {
  from: Date;
  to: Date;
  employeeCodes: string[] | null;
  includePunches: boolean;
}

/** One record per employee per work date across [from, to], including days
 * with no punch at all (absent/leave/holiday/weekly-off) — synthesized, not
 * a re-export of the Attendance table (see the response doc's note on this
 * endpoint). Bounded by the route's own 62-day range cap, so the full
 * cross-product (employees × days) stays small enough to build and sort
 * in memory rather than needing real DB-level pagination. */
export async function buildDailyAttendanceRange(
  organizationId: string,
  query: RangeQuery,
): Promise<AttendanceRecord[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      role: "EMPLOYEE",
      ...(query.employeeCodes ? { employeeCode: { in: query.employeeCodes } } : {}),
    },
    select: { id: true, employeeCode: true },
  });
  if (users.length === 0) return [];

  const ctx = await loadContext(organizationId, users.map((u) => u.id), query.from, query.to);
  const dayKeys = enumerateDateKeys(query.from, query.to);

  const records: AttendanceRecord[] = [];
  for (const user of users) {
    for (const day of dayKeys) {
      records.push(buildRecord(user, day, ctx, query.includePunches));
    }
  }
  records.sort((a, b) => (a.workDate === b.workDate ? a.employeeCode.localeCompare(b.employeeCode) : a.workDate.localeCompare(b.workDate)));
  return records;
}

export interface SinceQuery {
  since: Date;
  employeeCodes: string[] | null;
  includePunches: boolean;
}

/** Records for days whose *real* Attendance row (a check-in or check-out)
 * changed after `since` — a new punch or an admin's correction to a past
 * one. Deliberately does NOT synthesize absent/holiday/weekly-off days here:
 * those have no persisted row at all, so there is nothing that could have
 * "changed" for them to report (see the response doc's Identifiers gap on
 * Attendance previously having no updatedAt at all). */
export async function buildDailyAttendanceSince(
  organizationId: string,
  query: SinceQuery,
): Promise<AttendanceRecord[]> {
  const rows = await prisma.attendance.findMany({
    where: {
      user: {
        organizationId,
        role: "EMPLOYEE",
        ...(query.employeeCodes ? { employeeCode: { in: query.employeeCodes } } : {}),
      },
      updatedAt: { gt: query.since },
    },
    select: { userId: true, dayKey: true, updatedAt: true, user: { select: { id: true, employeeCode: true } } },
    orderBy: { updatedAt: "asc" },
  });
  if (rows.length === 0) return [];

  const seen = new Map<string, { user: { id: string; employeeCode: string }; day: string }>();
  for (const row of rows) {
    seen.set(`${row.userId}:${row.dayKey}`, { user: row.user, day: row.dayKey });
  }
  const pairs = [...seen.values()];
  const sortedDays = pairs.map((p) => p.day).sort();
  const from = dateOnlyFromKey(sortedDays[0]);
  const to = dateOnlyFromKey(sortedDays[sortedDays.length - 1]);
  const userIds = [...new Set(pairs.map((p) => p.user.id))];

  const ctx = await loadContext(organizationId, userIds, from, to);
  const records = pairs.map(({ user, day }) => buildRecord(user, day, ctx, query.includePunches));
  records.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return records;
}
