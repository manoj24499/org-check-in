import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/webEmployee";
import { limitEmployeeAction } from "@/lib/actionLimit";
import { todayDateOnlyIST } from "@/lib/istTime";

/** Withdraw a leave request the caller submitted themselves: while it is pending, or after approval as long as the
 * leave has not started. A declined or already-started one can't be undone from here. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmployee(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitEmployeeAction(auth.sub, "cancel", 30);
  if (limited) return limited;

  const { id } = await params;
  const request = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!request || request.userId !== auth.sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Pending ones, and approved ones that have not started yet (an approved leave that is under way or finished
  // already happened, so only an admin can change it). Leave an admin marked for the employee is the admin's to change.
  if (request.status === "APPROVED") {
    if (request.markedByAdmin) {
      return NextResponse.json({ error: "This leave was marked by your admin. Ask them to change it." }, { status: 409 });
    }
    if (request.startDate < todayDateOnlyIST()) {
      return NextResponse.json({ error: "This leave has already started, so it can't be cancelled here. Ask your admin." }, { status: 409 });
    }
  } else if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request can no longer be cancelled." }, { status: 409 });
  }

  // The status in the filter means a decision made at the same moment wins.
  const res = await prisma.timeOffRequest.updateMany({ where: { id, status: request.status }, data: { status: "CANCELLED" } });
  if (res.count === 0) {
    return NextResponse.json({ error: "This request just changed, so it can't be cancelled. Reload and check it." }, { status: 409 });
  }

  return NextResponse.json({ id, status: "CANCELLED" });
}
