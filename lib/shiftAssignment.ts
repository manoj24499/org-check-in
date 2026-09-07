import { prisma } from "@/lib/prisma";

export type ResolvedShift = { startTime: string; endTime: string };

/** Weekday -> shift, using JS `Date.getDay()`'s convention (0 = Sunday ...
 * 6 = Saturday) — the same convention ShiftAssignment.weekday is stored in. */
export type WeekdayShiftMap = Map<number, ResolvedShift>;

/**
 * Loads every ShiftAssignment row for one employee into a weekday -> shift
 * lookup — at most 7 entries, one query. Load this once per request and
 * reuse it via `shiftForDate` rather than querying per-date, since the
 * places that need it (autoCloseStaleCheckIns' backlog sweep, in particular)
 * may need to resolve several different dates in a single pass.
 */
export async function loadShiftAssignments(userId: string): Promise<WeekdayShiftMap> {
  const rows = await prisma.shiftAssignment.findMany({
    where: { userId },
    select: { weekday: true, shift: { select: { startTime: true, endTime: true } } },
  });
  const map: WeekdayShiftMap = new Map();
  for (const row of rows) map.set(row.weekday, row.shift);
  return map;
}

/** The shift (if any) that applies on `date`'s calendar day, per a map
 * already loaded by `loadShiftAssignments`. */
export function shiftForDate(map: WeekdayShiftMap, date: Date): ResolvedShift | null {
  return map.get(date.getDay()) ?? null;
}

/** A shift "spans midnight" (e.g. 16:00-02:00) exactly when its endTime
 * sorts at or before its startTime as plain "HH:mm" strings — there's no
 * separate flag on Shift for this (see its schema comment); it's the same
 * convention the admin Shifts UI now allows saving. Used everywhere that
 * needs to know whether "today's shift" is still governing an employee past
 * midnight, into the next IST calendar day. */
export function isOvernightShift(shift: { startTime: string; endTime: string }): boolean {
  return shift.endTime <= shift.startTime;
}
