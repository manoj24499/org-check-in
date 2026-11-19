import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

/** Cancels one of the caller's own meetings, as long as it hasn't finished. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const removed = await prisma.meeting.deleteMany({ where: { id, userId: auth.sub, endAt: { gt: new Date() } } });
  if (removed.count === 0) return NextResponse.json({ error: "Meeting not found, or it has already finished." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
