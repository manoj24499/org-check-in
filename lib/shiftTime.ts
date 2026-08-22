const SHIFT_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Combines an "HH:mm" shift time with the calendar date of `referenceDate`.
 * Shared by /api/kiosk/scan (lateness classification, stale-checkin
 * auto-checkout), /api/kiosk/location (Timed Permission auto-checkout), and
 * /api/admin/attendance/[id] (recomputing lateness on an edited check-in). */
export function combineDateAndShiftTime(referenceDate: Date, hhmm: string): Date | null {
  const match = SHIFT_TIME_PATTERN.exec(hhmm);
  if (!match) return null;
  const result = new Date(referenceDate);
  result.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return result;
}

export type Lateness = { lateMinutes: number | null; leaveType: "NONE" | "PERMISSION" | "HALF_DAY" };

/**
 * Late-arrival classification for OFFICE employees with a configured
 * shiftStartTime: up to `thresholdMinutes` late is treated as Permission,
 * beyond it is Half-day leave. WFH/FIELD employees and anyone without a
 * shiftStartTime set are never classified — leaveType stays NONE.
 *
 * `shift` is whatever applies to the *specific day* `checkInAt` falls on —
 * an employee can be on a different shift on different weekdays (see
 * lib/shiftAssignment.ts's shiftForDate), so callers must resolve that
 * first rather than assuming one fixed shift per employee.
 *
 * `thresholdMinutes` is the admin-configurable cutoff (AppSettings.
 * lateThresholdMinutes, see lib/settings.ts) — callers fetch settings
 * themselves and pass it in, rather than this function reaching for it, so
 * it stays a pure function of its inputs.
 */
export function computeLateness(
  user: { workMode: string; shift: { startTime: string } | null },
  checkInAt: Date,
  thresholdMinutes: number,
): Lateness {
  if (user.workMode !== "OFFICE" || !user.shift) {
    return { lateMinutes: null, leaveType: "NONE" };
  }
  const shiftStart = combineDateAndShiftTime(checkInAt, user.shift.startTime);
  if (!shiftStart) return { lateMinutes: null, leaveType: "NONE" };

  const lateMinutes = Math.round((checkInAt.getTime() - shiftStart.getTime()) / 60_000);
  if (lateMinutes <= 0) return { lateMinutes: 0, leaveType: "NONE" };
  if (lateMinutes <= thresholdMinutes) return { lateMinutes, leaveType: "PERMISSION" };
  return { lateMinutes, leaveType: "HALF_DAY" };
}
