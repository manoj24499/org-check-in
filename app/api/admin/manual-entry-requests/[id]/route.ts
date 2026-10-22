import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendPushNotification } from "@/lib/pushNotifications";
import { createManualAttendance, ManualEntryConflictError, resolveManualEntryTimes } from "@/lib/manualEntry";
import { istTimeOfDay } from "@/lib/istTime";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

const hhmm = (d: Date) => {
  const { hours, minutes } = istTimeOfDay(d);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

/** Approve (creates the MANUAL check-in/out rows) or decline a pending manual-entry request. Final once decided. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const request = await prisma.manualEntryRequest.findFirst({
    where: { id, user: { organizationId: admin.organizationId } },
  });
  if (!request) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  const reviewerName = admin.session.user.name ?? admin.session.user.email ?? "Admin";

  if (parsed.data.decision === "APPROVED") {
    // The 7-day window was enforced when the employee submitted; an approval a
    // few days later is still honoured, so it isn't re-applied here.
    const times = resolveManualEntryTimes(
      { date: request.date, checkIn: hhmm(request.checkInAt), checkOut: hhmm(request.checkOutAt) },
      { enforceWindow: false },
    );
    if ("error" in times) return NextResponse.json({ error: times.error }, { status: 400 });
    try {
      await createManualAttendance({
        userId: request.userId,
        organizationId: admin.organizationId,
        times,
        reason: request.reason,
        approvedByName: reviewerName,
      });
    } catch (err) {
      if (err instanceof ManualEntryConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }
  }

  const updated = await prisma.manualEntryRequest.update({
    where: { id },
    data: {
      status: parsed.data.decision,
      reviewedAt: new Date(),
      reviewedByName: reviewerName,
      reviewNote: parsed.data.note || null,
    },
  });

  await sendPushNotification(
    request.userId,
    parsed.data.decision === "APPROVED" ? "Manual entry approved" : "Manual entry declined",
    parsed.data.decision === "APPROVED"
      ? `Your attendance for ${request.date} was added.`
      : `Your manual entry request for ${request.date} was declined.`,
  );

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedByName: updated.reviewedByName,
    reviewNote: updated.reviewNote,
  });
}
