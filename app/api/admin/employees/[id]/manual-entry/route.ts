import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createManualAttendance, ManualEntryConflictError, resolveManualEntryTimes } from "@/lib/manualEntry";

const bodySchema = z.object({
  date: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  reason: z.string().trim().min(3, "Please give a reason.").max(500),
});

/**
 * Admin records a day's check-in and check-out directly (no employee request)
 * — for a device failure or similar. Limited to the last 7 days, refuses a day
 * that already has a punch, and stamps both rows MANUAL with the reason and
 * this admin's name.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const employee = await prisma.user.findFirst({
    where: { id, organizationId: admin.organizationId, role: "EMPLOYEE" },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const times = resolveManualEntryTimes(parsed.data, { enforceWindow: true });
  if ("error" in times) return NextResponse.json({ error: times.error }, { status: 400 });

  try {
    await createManualAttendance({
      userId: id,
      organizationId: admin.organizationId,
      times,
      reason: parsed.data.reason,
      approvedByName: admin.session.user.name ?? admin.session.user.email ?? "Admin",
    });
  } catch (err) {
    if (err instanceof ManualEntryConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
