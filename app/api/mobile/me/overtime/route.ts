import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { startOfISTDay } from "@/lib/istTime";

/** The employee's currently active (checked-in today, not yet checked out) session. */
async function findActiveCheckIn(userId: string) {
  const today = startOfISTDay();
  const checkIn = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: today } },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true },
  });
  if (!checkIn) return null;

  const laterCheckOut = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_OUT", timestamp: { gt: checkIn.timestamp } },
    select: { id: true },
  });
  return laterCheckOut ? null : checkIn;
}

const bodySchema = z.object({
  estimatedEndAt: z.string(),
  reason: z.string().trim().min(1).max(300),
});

/**
 * Self-declared, takes effect immediately — no approval wait, unlike how
 * TimedPermission's own pause-opening logic actually behaves despite similar
 * "immediate" framing in its UI (see the schema comment on OvertimeRequest
 * for that gotcha). The moment this row exists, /api/kiosk/location's
 * reminder evaluator uses `estimatedEndAt` instead of the plain shift end,
 * and /api/kiosk/scan's checkout accepts an optional work-summary for it.
 * `status` below is purely for the admin's own record — reviewing it never
 * blocks or changes anything the employee can already do.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const estimatedEndAt = new Date(parsed.data.estimatedEndAt);
  if (Number.isNaN(estimatedEndAt.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (estimatedEndAt <= new Date()) {
    return NextResponse.json({ error: "Estimated end time must be in the future." }, { status: 400 });
  }

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) {
    return NextResponse.json(
      { error: "Check in before requesting overtime." },
      { status: 409 },
    );
  }

  // Refuse a second request while one is still open (no work summary
  // submitted yet, i.e. hasn't been closed out at a checkout) — avoids
  // ambiguity about which request's estimatedEndAt governs the reminder.
  const existing = await prisma.overtimeRequest.findFirst({
    where: { attendanceId: checkIn.id, submittedAt: null },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have an active overtime request today." },
      { status: 409 },
    );
  }

  const request = await prisma.overtimeRequest.create({
    data: { attendanceId: checkIn.id, estimatedEndAt, reason: parsed.data.reason },
  });

  return NextResponse.json({
    id: request.id,
    estimatedEndAt: request.estimatedEndAt.toISOString(),
    reason: request.reason,
    status: request.status,
  });
}

/** Today's overtime request for the caller's own active session, if any. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json({ requests: [] });

  const requests = await prisma.overtimeRequest.findMany({
    where: { attendanceId: checkIn.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      estimatedEndAt: r.estimatedEndAt.toISOString(),
      reason: r.reason,
      status: r.status,
      // From the employee's own perspective — distinct from `status`
      // (the admin's after-the-fact decision, which never gates this):
      // "active" means it's still governing the reminder/checkout flow,
      // "completed" means it's been closed out at a checkout already.
      active: r.submittedAt === null,
    })),
  });
}
