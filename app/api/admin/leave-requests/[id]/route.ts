import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendPushNotification } from "@/lib/pushNotifications";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(300).optional(),
});

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** Approve or reject a pending leave request. Only ever acts on a
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

  const request = await prisma.timeOffRequest.findUnique({ where: { id } });
  if (!request) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  const updated = await prisma.timeOffRequest.update({
    where: { id },
    data: {
      status: parsed.data.decision,
      reviewedAt: new Date(),
      reviewedByName: session.user.name ?? session.user.email ?? "Admin",
      // Only meaningful alongside a decline — a note on an approval has
      // nothing to attach to, so don't store one even if somehow sent.
      reviewNote: parsed.data.decision === "REJECTED" ? (parsed.data.note ?? null) : null,
    },
  });

  const rangeLabel =
    updated.startDate.getTime() === updated.endDate.getTime()
      ? formatDate(updated.startDate)
      : `${formatDate(updated.startDate)} – ${formatDate(updated.endDate)}`;

  await sendPushNotification(
    request.userId,
    parsed.data.decision === "APPROVED" ? "Leave approved" : "Leave declined",
    parsed.data.decision === "APPROVED"
      ? `Your leave request for ${rangeLabel} was approved.`
      : updated.reviewNote
        ? `Your leave request for ${rangeLabel} was declined: ${updated.reviewNote}`
        : `Your leave request for ${rangeLabel} was declined.`,
  );

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    reviewedByName: updated.reviewedByName,
    reviewNote: updated.reviewNote,
  });
}
