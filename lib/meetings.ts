import { prisma } from "@/lib/prisma";
import { combineDateAndShiftEndTime, combineDateAndShiftTime } from "@/lib/shiftTime";

/** A meeting that starts within this long after the shift/overtime end still counts as the same stretch of work. */
export const MEETING_JOIN_GAP_MS = 30 * 60 * 1000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Weekday of an instant in IST (0 = Sunday), the convention ShiftAssignment.weekday uses. */
export function istWeekday(instant: Date): number {
  return new Date(instant.getTime() + IST_OFFSET_MS).getUTCDay();
}

type Span = { startAt: Date; endAt: Date };

/**
 * Pushes an end-of-work time out past any declared meeting that is running at it or starts shortly after it
 * (within MEETING_JOIN_GAP_MS), chaining through back-to-back meetings. Used so the "shift ending soon" push and
 * the automatic check-out wait for the meeting instead of cutting into it. Returns `target` itself when there is
 * no such meeting.
 */
export function extendForMeetings(target: Date, meetings: Span[]): Date {
  let t = target;
  for (let guard = 0; guard < meetings.length + 1; guard++) {
    const next = meetings.find((m) => m.endAt > t && m.startAt.getTime() <= t.getTime() + MEETING_JOIN_GAP_MS);
    if (!next) break;
    t = next.endAt;
  }
  return t;
}

/** Same, loading the one employee's meetings around `target` itself. */
export async function extendTargetForMeetings(userId: string, target: Date): Promise<Date> {
  const meetings = await prisma.meeting.findMany({
    where: { userId, endAt: { gt: target }, startAt: { lte: new Date(target.getTime() + 12 * 3600 * 1000) } },
    orderBy: { startAt: "asc" },
    select: { startAt: true, endAt: true },
  });
  return extendForMeetings(target, meetings);
}

/**
 * Whether a meeting sits entirely inside the employee's shift on its day. Those are refused: during shift hours
 * the employee is already on the clock, so there is nothing to declare. A meeting that only partly overlaps the
 * shift still counts as one outside it. No shift that day means nothing to be "inside" of.
 */
export function isInsideShift(
  start: Date,
  end: Date,
  shift: { startTime: string; endTime: string } | null,
): boolean {
  if (!shift) return false;
  const shiftStart = combineDateAndShiftTime(start, shift.startTime);
  const shiftEnd = combineDateAndShiftEndTime(start, shift);
  if (!shiftStart || !shiftEnd) return false;
  return start >= shiftStart && end <= shiftEnd;
}
