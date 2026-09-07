import { prisma } from "@/lib/prisma";
import { startOfISTDay } from "@/lib/istTime";
import { loadShiftAssignments, shiftForDate, isOvernightShift } from "@/lib/shiftAssignment";

export interface ActiveCheckIn {
  id: string;
  timestamp: Date;
}

/**
 * The employee's currently active session — the CHECK_IN to hang a new
 * overtime request / timed permission / work-segment switch / field visit
 * off of, or to report status against. Shared by /api/kiosk/status,
 * /api/kiosk/scan (checkout gating), and every /api/mobile/me/* route that
 * needs "am I actively checked in right now" (this used to be a
 * hand-copied `findActiveCheckIn` in three separate route files).
 *
 * Ordinarily this is just today's IST-day check-in with no CHECK_OUT after
 * it yet. The one extension: an overnight shift (see the schema comment on
 * Shift, and isOvernightShift — endTime at or before startTime, e.g.
 * 16:00-02:00). An employee who checked in yesterday evening for one is
 * still on a legitimate open session after midnight, even though that
 * check-in's own timestamp is technically "yesterday." This only ever
 * extends the lookup back to yesterday when (a) there's no check-in yet
 * today, (b) yesterday's check-in has no CHECK_OUT after it, and (c)
 * yesterday's own assigned shift (for whichever weekday it fell on) was
 * itself overnight — every same-day shift, the overwhelming majority, never
 * hits any of this and behaves exactly as before.
 */
export async function findActiveCheckIn(userId: string): Promise<ActiveCheckIn | null> {
  const today = startOfISTDay();

  const todaysCheckIn = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: today } },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true },
  });
  if (todaysCheckIn) {
    const laterCheckOut = await prisma.attendance.findFirst({
      where: { userId, type: "CHECK_OUT", timestamp: { gt: todaysCheckIn.timestamp } },
      select: { id: true },
    });
    return laterCheckOut ? null : todaysCheckIn;
  }

  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdaysCheckIn = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: yesterday, lt: today } },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true },
  });
  if (!yesterdaysCheckIn) return null;

  const laterCheckOut = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_OUT", timestamp: { gt: yesterdaysCheckIn.timestamp } },
    select: { id: true },
  });
  if (laterCheckOut) return null;

  const shiftMap = await loadShiftAssignments(userId);
  const shiftThatDay = shiftForDate(shiftMap, yesterdaysCheckIn.timestamp);
  if (!shiftThatDay || !isOvernightShift(shiftThatDay)) return null;

  return yesterdaysCheckIn;
}
