// This app's business (shifts, attendance, leave, holidays) all runs on IST
// (Asia/Kolkata) calendar days and wall-clock times, but the server's local
// clock is whatever timezone the process happens to run in — UTC on Vercel,
// but IST on most contributors' dev machines, which is exactly why the bug
// this file fixes was invisible in local testing. India does not observe
// DST, so a fixed +5:30 offset is always correct — no timezone database or
// Intl API dependency needed.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the IST calendar day that `instant` falls in (00:00:00.000 IST),
 * returned as the correct UTC instant. Use this — never `setHours` — to
 * bucket a real timestamp (Attendance.timestamp, LocationPing.timestamp,
 * "now") into "today"/"that day" for IST-based business logic. */
export function startOfISTDay(instant: Date = new Date()): Date {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** End of the IST calendar day that `instant` falls in (23:59:59.999 IST). */
export function endOfISTDay(instant: Date = new Date()): Date {
  return new Date(startOfISTDay(instant).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** "YYYY-MM-DD" label for the IST calendar day `instant` falls in — for
 * display, grouping keys, and API date fields. Correct for any instant
 * regardless of server timezone (unlike `date.toISOString().slice(0, 10)`
 * or local getters, both of which depend on the server's own clock). */
export function istDateKey(instant: Date = new Date()): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parses an admin/user-picked "YYYY-MM-DD" calendar date (e.g. from a
 * `<input type="date">` or a `?date=` query param) the same way bare ISO
 * date-only strings are already parsed elsewhere in this app (PublicHoliday,
 * TimeOffRequest) — as UTC midnight of that date, which is a deterministic,
 * server-timezone-independent encoding of "this calendar date" and always
 * falls inside the correct IST day (UTC midnight is 5:30am IST). Returns
 * null for anything not in that exact shape. */
export function parseDateOnlyKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's IST calendar date, encoded the same date-only way as
 * `parseDateOnlyKey` (UTC midnight of today's IST date) — for comparing
 * against date-only fields like TimeOffRequest.startDate. */
export function todayDateOnlyIST(): Date {
  return parseDateOnlyKey(istDateKey())!;
}

/** Start of the IST calendar month that `instant` falls in, as the correct UTC instant. */
export function startOfISTMonth(instant: Date = new Date()): Date {
  const key = istDateKey(instant);
  const firstOfMonth = parseDateOnlyKey(`${key.slice(0, 7)}-01`)!;
  return startOfISTDay(firstOfMonth);
}

/** {hours, minutes} of the IST wall-clock time `instant` falls at (0-23,
 * 0-59) — for anything display-facing like "average check-in time", which
 * needs the actual local time of day, not the server's own clock's. */
export function istTimeOfDay(instant: Date): { hours: number; minutes: number } {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return { hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes() };
}

const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Combines an "HH:mm" wall-clock time — always interpreted as IST, since
 * that's the timezone admins configure shift times in — with the IST
 * calendar date `referenceInstant` falls on, returning the correct UTC
 * instant. */
export function combineISTDateAndTime(referenceInstant: Date, hhmm: string): Date | null {
  const match = SHIFT_TIME_PATTERN.exec(hhmm);
  if (!match) return null;
  const dayStart = startOfISTDay(referenceInstant);
  return new Date(dayStart.getTime() + (Number(match[1]) * 60 + Number(match[2])) * 60_000);
}
