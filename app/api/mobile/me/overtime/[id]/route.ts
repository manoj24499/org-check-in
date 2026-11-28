import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/webEmployee";
import { limitEmployeeAction } from "@/lib/actionLimit";

/**
 * Withdraw an overtime request the caller made themselves, for when it was sent by mistake: pending or approved, as
 * long as it hasn't been worked and closed out with a check-out. The request is removed, so the shift-end reminder
 * goes back to the normal shift end.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmployee(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitEmployeeAction(auth.sub, "cancel", 30);
  if (limited) return limited;

  const { id } = await params;
  const request = await prisma.overtimeRequest.findFirst({
    where: { id, attendance: { userId: auth.sub } },
    select: { status: true, submittedAt: true },
  });
  if (!request) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (request.status === "REJECTED") {
    return NextResponse.json({ error: "This request was declined, so there is nothing to cancel." }, { status: 409 });
  }
  if (request.submittedAt) {
    return NextResponse.json({ error: "This overtime was already worked and closed out at check-out, so it can't be cancelled." }, { status: 409 });
  }

  const res = await prisma.overtimeRequest.deleteMany({ where: { id, status: request.status, submittedAt: null } });
  if (res.count === 0) {
    return NextResponse.json({ error: "This request just changed, so it can't be cancelled. Reload and check it." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
