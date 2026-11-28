import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/webEmployee";
import { limitEmployeeAction } from "@/lib/actionLimit";

/**
 * Withdraw a timed-permission request the caller made themselves, for when it was sent by mistake: while it is
 * pending, or after approval until its time window begins (the pause only starts at the window's start). The request
 * is simply removed.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmployee(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitEmployeeAction(auth.sub, "cancel", 30);
  if (limited) return limited;

  const { id } = await params;
  const permission = await prisma.timedPermission.findFirst({
    where: { id, attendance: { userId: auth.sub } },
    select: { approvalStatus: true, startTime: true, pause: { select: { id: true } } },
  });
  if (!permission) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (permission.approvalStatus === "REJECTED") {
    return NextResponse.json({ error: "This request was declined, so there is nothing to cancel." }, { status: 409 });
  }
  // An approved permission can be cancelled until its time window begins; after that the pause has started (or is
  // about to), and that time is already part of the day's record.
  if (permission.pause || (permission.approvalStatus === "APPROVED" && permission.startTime <= new Date())) {
    return NextResponse.json({ error: "This permission has already started, so it can't be cancelled." }, { status: 409 });
  }

  // The status in the filter means a decision made at the same moment wins, and nothing is deleted.
  const res = await prisma.timedPermission.deleteMany({ where: { id, approvalStatus: permission.approvalStatus, pause: null } });
  if (res.count === 0) {
    return NextResponse.json({ error: "This request just changed, so it can't be cancelled. Reload and check it." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
