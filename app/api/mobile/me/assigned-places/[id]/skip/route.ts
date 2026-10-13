import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

const bodySchema = z.object({ reason: z.string().trim().min(1).max(300) });

/** The worker could not visit an assigned place (closed, unreachable...): mark it skipped with a reason. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please give a reason." }, { status: 400 });

  const { id } = await params;
  // Only the owner's own, still-pending place can be skipped.
  const result = await prisma.assignedPlace.updateMany({
    where: { id, userId: auth.sub, status: "PENDING" },
    data: { status: "SKIPPED", skipReason: parsed.data.reason },
  });
  if (result.count === 0) return NextResponse.json({ error: "That place is not available to skip." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
