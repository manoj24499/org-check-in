import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

/** Withdraw a leave request the caller submitted themselves — only while
 * it's still PENDING. Once an admin has decided it (approved or rejected),
 * this is final; there's no self-service undo past that point. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const request = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!request || request.userId !== auth.sub) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Only a pending request can be cancelled." }, { status: 409 });
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
