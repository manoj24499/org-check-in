import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendPushNotification } from "@/lib/pushNotifications";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Approve or reject an overtime request — record-keeping only. Unlike
 * /api/admin/timed-permissions/[id], this decision never changes what the
 * employee can already do (the request took effect the moment it was
 * created — see the schema comment on OvertimeRequest). Only ever acts on a
 * still-PENDING row — once decided, a decision is final (no re-review).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const request = await prisma.overtimeRequest.findUnique({
    where: { id },
    include: { attendance: { select: { userId: true } } },
  });
  if (!request) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  const updated = await prisma.overtimeRequest.update({
    where: { id },
    data: {
      status: parsed.data.decision,
      reviewedAt: new Date(),
      reviewedByName: session.user.name ?? session.user.email ?? "Admin",
    },
  });

  const endLabel = formatTime(updated.estimatedEndAt);
  await sendPushNotification(
    request.attendance.userId,
    parsed.data.decision === "APPROVED" ? "Overtime approved" : "Overtime declined",
    parsed.data.decision === "APPROVED"
      ? `Your overtime request (until ~${endLabel}) was approved.`
      : `Your overtime request (until ~${endLabel}) was declined.`,
  );

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedByName: updated.reviewedByName,
  });
}
