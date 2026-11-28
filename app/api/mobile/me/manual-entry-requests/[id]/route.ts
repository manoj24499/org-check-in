import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEmployee } from "@/lib/webEmployee";
import { limitEmployeeAction } from "@/lib/actionLimit";

/** Withdraw a manual check-in/out request the caller made themselves. Only while it is still PENDING; it is removed. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmployee(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await limitEmployeeAction(auth.sub, "cancel", 30);
  if (limited) return limited;

  const { id } = await params;
  const request = await prisma.manualEntryRequest.findFirst({ where: { id, userId: auth.sub }, select: { status: true } });
  if (!request) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Only a pending request can be cancelled." }, { status: 409 });
  }

  const res = await prisma.manualEntryRequest.deleteMany({ where: { id, userId: auth.sub, status: "PENDING" } });
  if (res.count === 0) {
    return NextResponse.json({ error: "This request was just reviewed, so it can no longer be cancelled." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
