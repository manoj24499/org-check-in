import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const putSchema = z.object({
  // Empty clears it.
  billingEmail: z.string().trim().toLowerCase().email().max(200).or(z.literal("")),
});

/** The extra address that also receives trial reminder / trial-ended emails (see lib/trialWatch.ts). */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const billingEmail = parsed.data.billingEmail || null;
  await prisma.organization.update({ where: { id: admin.organizationId }, data: { billingEmail } });
  return NextResponse.json({ billingEmail });
}
