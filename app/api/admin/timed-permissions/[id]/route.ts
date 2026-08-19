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

/** Approve or reject a pending timed-permission request. Only ever acts on a
 * still-PENDING row — once decided, a decision is final (no re-review). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const permission = await prisma.timedPermission.findUnique({
    where: { id },
    include: { attendance: { select: { userId: true } } },
  });
  if (!permission) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (permission.approvalStatus !== "PENDING") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  const updated = await prisma.timedPermission.update({
    where: { id },
    data: {
      approvalStatus: parsed.data.decision,
      reviewedAt: new Date(),
      reviewedByName: session.user.name ?? session.user.email ?? "Admin",
    },
  });

  const windowLabel = `${formatTime(updated.startTime)}–${formatTime(updated.endTime)}`;
  await sendPushNotification(
    permission.attendance.userId,
    parsed.data.decision === "APPROVED" ? "Permission approved" : "Permission declined",
    parsed.data.decision === "APPROVED"
      ? `Your ${windowLabel} permission request was approved.`
      : `Your ${windowLabel} permission request was declined.`,
  );

  return NextResponse.json({
    id: updated.id,
    approvalStatus: updated.approvalStatus,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedByName: updated.reviewedByName,
  });
}
