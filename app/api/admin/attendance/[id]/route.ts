import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { computeLateness } from "@/lib/shiftTime";
import { loadShiftAssignments, shiftForDate } from "@/lib/shiftAssignment";
import { getSettings } from "@/lib/settings";
import { startOfISTDay, endOfISTDay } from "@/lib/istTime";

const bodySchema = z.object({
  timestamp: z.string(),
});

/**
 * Admin correction of a single attendance record's timestamp — for fixing a
 * stale-checkin auto-checkout's estimate (see /api/kiosk/scan's
 * autoCloseStaleCheckIns), a kiosk misfire, or any other wrong time. Only
 * the time-of-day can move — the calendar day stays fixed, so this can never
 * reassign a record to a different day and break the one-check-in-plus-one-
 * check-out-per-day pairing every other view already assumes.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const record = await prisma.attendance.findUnique({
    where: { id },
    select: { userId: true, type: true, timestamp: true },
  });
  if (!record) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const newTimestamp = new Date(parsed.data.timestamp);
  if (Number.isNaN(newTimestamp.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const dayStart = startOfISTDay(record.timestamp);
  const dayEnd = endOfISTDay(record.timestamp);
  if (newTimestamp < dayStart || newTimestamp > dayEnd) {
    return NextResponse.json({ error: "Only the time can be changed, not the day." }, { status: 400 });
  }

  // The paired record for that same calendar day, if any — same one-in/
  // one-out assumption every calendar/history view already makes.
  const pairedType = record.type === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN";
  const paired = await prisma.attendance.findFirst({
    where: { userId: record.userId, type: pairedType, timestamp: { gte: dayStart, lte: dayEnd } },
    select: { id: true, timestamp: true },
  });

  if (record.type === "CHECK_IN" && paired && newTimestamp >= paired.timestamp) {
    return NextResponse.json({ error: "Check-in must be before check-out." }, { status: 400 });
  }
  if (record.type === "CHECK_OUT" && paired && newTimestamp <= paired.timestamp) {
    return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 });
  }

  const oldTimestamp = record.timestamp;

  if (record.type === "CHECK_IN") {
    const [user, settings] = await Promise.all([
      prisma.user.findUnique({ where: { id: record.userId } }),
      getSettings(),
    ]);
    // Resolved for the *new* timestamp's weekday (same calendar day as
    // before per the check above, so same weekday too — this is just the
    // correct, general lookup rather than assuming one fixed shift).
    const lateness = user
      ? computeLateness(
          { workMode: user.workMode, shift: shiftForDate(await loadShiftAssignments(user.id), newTimestamp) },
          newTimestamp,
          settings.lateThresholdMinutes,
        )
      : { lateMinutes: null, leaveType: "NONE" as const };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({
        where: { id },
        data: { timestamp: newTimestamp, lateMinutes: lateness.lateMinutes, leaveType: lateness.leaveType },
      });
      // The very first WorkSegment (see /api/kiosk/scan) was stamped with
      // the check-in's own timestamp — keep it in step so there's no
      // phantom gap/overlap between "officially checked in" and "work
      // started". Only the one still pinned to the old value; anything a
      // later auto/manual switch already moved past is left alone.
      await tx.workSegment.updateMany({
        where: { attendanceId: id, startMethod: "CHECKIN", startedAt: oldTimestamp },
        data: { startedAt: newTimestamp },
      });
      return result;
    });

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      timestamp: updated.timestamp.toISOString(),
      lateMinutes: updated.lateMinutes,
      leaveType: updated.leaveType,
    });
  }

  // CHECK_OUT: also shift any pause/segment that was closed exactly at the
  // *old* checkout time (see /api/kiosk/scan's checkout-closing transaction
  // and autoCloseStaleCheckIns) so they still end at the new checkout
  // instead of being stranded at the old, now-wrong time.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.attendance.update({ where: { id }, data: { timestamp: newTimestamp } });
    if (paired) {
      await tx.attendancePause.updateMany({
        where: { attendanceId: paired.id, resumedAt: oldTimestamp },
        data: { resumedAt: newTimestamp },
      });
      await tx.workSegment.updateMany({
        where: { attendanceId: paired.id, endedAt: oldTimestamp },
        data: { endedAt: newTimestamp },
      });
    }
    return result;
  });

  return NextResponse.json({
    id: updated.id,
    type: updated.type,
    timestamp: updated.timestamp.toISOString(),
    lateMinutes: updated.lateMinutes,
    leaveType: updated.leaveType,
  });
}
