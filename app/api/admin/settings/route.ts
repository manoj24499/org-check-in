import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSettings, updateSettings } from "@/lib/settings";

const putSchema = z.object({
  checkOutPhotoRequired: z.boolean().optional(),
  reimbursementRatePerKm: z.number().min(0).nullable().optional(),
  casualLeaveQuota: z.number().int().min(0).optional(),
  sickLeaveQuota: z.number().int().min(0).optional(),
  earnedLeaveQuota: z.number().int().min(0).optional(),
  // Upper bound of 8 hours is generous headroom, not a real-world
  // expectation — just enough to stop an obvious typo (e.g. missing a
  // digit) from silently taking effect.
  lateThresholdMinutes: z.number().int().min(1).max(480).optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const settings = await updateSettings(parsed.data);
  return NextResponse.json({ settings });
}
