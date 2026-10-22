import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { combineISTDateAndTime, istDateKey, parseDateOnlyKey, startOfISTDay } from "@/lib/istTime";
import { computeLateness } from "@/lib/shiftTime";
import { loadShiftAssignments, shiftForDate } from "@/lib/shiftAssignment";
import { getSettings } from "@/lib/settings";

/** How far back a manual entry (or request for one) may reach — today and the previous 7 days. */
export const MANUAL_ENTRY_MAX_DAYS_BACK = 7;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ManualEntryTimes = { dateKey: string; checkInAt: Date; checkOutAt: Date };

/**
 * Turns an IST day ("YYYY-MM-DD") plus two "HH:mm" IST wall-clock times into
 * real instants, and checks them. `enforceWindow` is the 7-day/no-future rule:
 * applied when an entry or request is created, but not when an admin approves
 * a request that was valid when submitted.
 */
export function resolveManualEntryTimes(
  input: { date: string; checkIn: string; checkOut: string },
  opts: { enforceWindow: boolean },
): ManualEntryTimes | { error: string } {
  const day = parseDateOnlyKey(input.date);
  if (!day) return { error: "Invalid date." };
  if (!HHMM.test(input.checkIn) || !HHMM.test(input.checkOut)) return { error: "Enter valid times." };

  const checkInAt = combineISTDateAndTime(day, input.checkIn)!;
  const checkOutAt = combineISTDateAndTime(day, input.checkOut)!;
  if (checkOutAt <= checkInAt) return { error: "Check-out must be after check-in." };

  if (opts.enforceWindow) {
    const now = new Date();
    const todayStart = startOfISTDay(now);
    const oldestAllowed = new Date(todayStart.getTime() - MANUAL_ENTRY_MAX_DAYS_BACK * 86_400_000);
    if (startOfISTDay(day) < oldestAllowed) {
      return { error: `Manual entries can only go back ${MANUAL_ENTRY_MAX_DAYS_BACK} days.` };
    }
    if (checkOutAt > now) return { error: "Times can't be in the future." };
  }

  return { dateKey: istDateKey(day), checkInAt, checkOutAt };
}

export class ManualEntryConflictError extends Error {}

/**
 * Creates the CHECK_IN and CHECK_OUT rows (method MANUAL) for one employee-day,
 * atomically. Throws ManualEntryConflictError if that day already has either —
 * the (userId, type, dayKey) unique constraint is the real guard, so this is
 * race-safe. Lateness is computed against that day's shift, exactly as a real
 * punch would be. A FIELD employee also gets a closed OFFICE WorkSegment so
 * their Field/Office timeline isn't left empty.
 */
export async function createManualAttendance(params: {
  userId: string;
  organizationId: string;
  times: ManualEntryTimes;
  reason: string;
  approvedByName: string;
}) {
  const { userId, organizationId, times, reason, approvedByName } = params;
  const [user, settings, shiftMap] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, organizationId, role: "EMPLOYEE" } }),
    getSettings(organizationId),
    loadShiftAssignments(userId),
  ]);
  if (!user) throw new Error("Employee not found.");

  const lateness = computeLateness(
    { workMode: user.workMode, shift: shiftForDate(shiftMap, times.checkInAt) },
    times.checkInAt,
    settings.lateThresholdMinutes,
  );

  const base = { userId, method: "MANUAL" as const, dayKey: times.dateKey, manualReason: reason, manualApprovedByName: approvedByName };

  try {
    return await prisma.$transaction(async (tx) => {
      const checkIn = await tx.attendance.create({
        data: {
          ...base,
          type: "CHECK_IN",
          timestamp: times.checkInAt,
          lateMinutes: lateness.lateMinutes,
          leaveType: lateness.leaveType,
          ...(user.workMode === "FIELD" ? { checkInMode: "OFFICE" as const } : {}),
        },
      });
      const checkOut = await tx.attendance.create({
        data: { ...base, type: "CHECK_OUT", timestamp: times.checkOutAt },
      });
      if (user.workMode === "FIELD") {
        await tx.workSegment.create({
          data: {
            attendanceId: checkIn.id,
            mode: "OFFICE",
            startedAt: times.checkInAt,
            endedAt: times.checkOutAt,
            startMethod: "MANUAL",
          },
        });
      }
      return { checkIn, checkOut };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ManualEntryConflictError("That day already has a check-in or check-out recorded.");
    }
    throw err;
  }
}
