import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { countLeaveDays, getLeaveBalances } from "@/lib/timeOff";
import { parseDateOnlyKey, startOfISTDay, endOfISTDay, todayDateOnlyIST, istDateKey } from "@/lib/istTime";

const bodySchema = z.object({
  type: z.enum(["CASUAL", "SICK", "EARNED"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Self-declared leave request — takes effect only once an admin approves it
 * (see /api/admin/leave-requests/[id]). Whole days only; no half-day
 * support. Unrelated to Attendance.leaveType (an auto-computed lateness
 * classification with a confusingly similar name) and to TimedPermission (a
 * same-day, hours-long pause during an active check-in) — this is neither.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // startDate/endDate arrive as plain "YYYY-MM-DD" calendar dates (same
  // convention as PublicHoliday.date) and are parsed the same
  // timezone-independent way — see lib/istTime.ts.
  const startDate = parseDateOnlyKey(parsed.data.startDate);
  const endDate = parseDateOnlyKey(parsed.data.endDate);
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
  }
  const today = todayDateOnlyIST();
  if (startDate < today) {
    return NextResponse.json({ error: "Leave can't be requested for a past date." }, { status: 400 });
  }

  // A day already worked can't also be a leave day — refuse the overlap
  // rather than silently accepting a contradictory record. startDate/endDate
  // are date-only keys, so this needs the true IST day window to compare
  // against Attendance.timestamp (a real instant).
  const alreadyWorked = await prisma.attendance.findFirst({
    where: {
      userId: auth.sub,
      type: "CHECK_IN",
      timestamp: { gte: startOfISTDay(startDate), lte: endOfISTDay(endDate) },
    },
    select: { id: true },
  });
  if (alreadyWorked) {
    return NextResponse.json(
      { error: "You already have a check-in recorded during this date range." },
      { status: 409 },
    );
  }

  // Refuse overlap with another request that's still pending or already
  // approved — avoids double-counting the same day against the balance.
  const overlapping = await prisma.timeOffRequest.findFirst({
    where: {
      userId: auth.sub,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: "You already have a leave request covering part of this date range." },
      { status: 409 },
    );
  }

  const days = await countLeaveDays(startDate, endDate);
  if (days === 0) {
    return NextResponse.json(
      { error: "Every day in this range is a public holiday — nothing to request." },
      { status: 400 },
    );
  }

  const balances = await getLeaveBalances(auth.sub);
  const balance = balances.find((b) => b.type === parsed.data.type);
  if (balance && days > balance.remaining) {
    return NextResponse.json(
      {
        error: `Only ${balance.remaining} ${parsed.data.type.toLowerCase()} leave day(s) remaining this year.`,
      },
      { status: 400 },
    );
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      userId: auth.sub,
      type: parsed.data.type,
      startDate,
      endDate,
      days,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({
    id: request.id,
    type: request.type,
    startDate: request.startDate.toISOString(),
    endDate: request.endDate.toISOString(),
    days: request.days,
    reason: request.reason,
    status: request.status,
  });
}

/** This year's leave requests and balances for the caller. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const year = Number(istDateKey().slice(0, 4));
  const [requests, balances] = await Promise.all([
    prisma.timeOffRequest.findMany({
      where: {
        userId: auth.sub,
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      orderBy: { startDate: "desc" },
    }),
    getLeaveBalances(auth.sub),
  ]);

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      days: r.days,
      reason: r.reason,
      status: r.status,
      reviewNote: r.reviewNote,
    })),
    balances,
  });
}
