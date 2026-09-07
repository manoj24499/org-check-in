import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { todayDateOnlyIST } from "@/lib/istTime";
import { countLeaveDays } from "@/lib/timeOff";
import { sendPushNotification } from "@/lib/pushNotifications";

const bodySchema = z.object({
  type: z.enum(["CASUAL", "SICK", "EARNED"]),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Quick admin action: mark an employee on leave for TODAY only, without
 * them submitting a request first (e.g. they called in sick and the admin
 * wants the dashboard/check-in gate to reflect it right away). Reuses
 * TimeOffRequest — the same model the employee-submitted flow uses (see
 * /api/mobile/me/leave-requests) — so this automatically gets check-in
 * blocking for free (see /api/kiosk/scan's onApprovedLeaveToday check) and
 * shows up identically everywhere leave is already surfaced (Leave page,
 * balances). Created pre-approved (the admin doing this IS the approval),
 * always a single day (startDate === endDate === today), with
 * markedByAdmin: true — that flag (not just the single-day shape, which an
 * ordinary submission could equally have) is what DELETE's safety check
 * below relies on to avoid ever touching a real employee-submitted request.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const today = todayDateOnlyIST();

  // Refuse if there's already an active (pending or approved) request
  // covering today, quick-marked or normally submitted — creating a second
  // overlapping request would be ambiguous about which one actually governs
  // the check-in gate.
  const existing = await prisma.timeOffRequest.findFirst({
    where: { userId: id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: today }, endDate: { gte: today } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This employee already has an active leave request covering today." },
      { status: 409 },
    );
  }

  const days = await countLeaveDays(today, today);

  const request = await prisma.timeOffRequest.create({
    data: {
      userId: id,
      type: parsed.data.type,
      startDate: today,
      endDate: today,
      days,
      reason: parsed.data.reason || null,
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedByName: session.user.name ?? session.user.email ?? "Admin",
      markedByAdmin: true,
    },
  });

  await sendPushNotification(id, "Marked on leave today", "Your admin has marked you on leave for today.");

  return NextResponse.json({
    id: request.id,
    type: request.type,
    startDate: request.startDate.toISOString(),
    endDate: request.endDate.toISOString(),
  });
}

/**
 * Undo the quick "mark as leave" action — only ever touches a request this
 * same action created (markedByAdmin: true). Never touches a real
 * employee-submitted request, even an ordinary single-day one that happens
 * to look identical otherwise (same status, same one-day range covering
 * today) — that should only ever be managed from the Leave page.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const today = todayDateOnlyIST();

  const existing = await prisma.timeOffRequest.findFirst({
    where: { userId: id, status: "APPROVED", startDate: today, endDate: today, markedByAdmin: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "No quick leave marking found for today." }, { status: 404 });
  }

  await prisma.timeOffRequest.update({
    where: { id: existing.id },
    data: {
      status: "CANCELLED",
      reviewedAt: new Date(),
      reviewedByName: session.user.name ?? session.user.email ?? "Admin",
    },
  });

  return NextResponse.json({ ok: true });
}
