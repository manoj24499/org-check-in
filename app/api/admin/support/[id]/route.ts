import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendPushNotification } from "@/lib/pushNotifications";

const patchSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]),
  adminNote: z.string().trim().max(1000).optional(),
});

/** Marks a support ticket resolved (or reopens it). Reopening is pure
 * record-keeping, same as Leave/Overtime's decision endpoints — but
 * resolving does notify the employee back (unlike Leave/Overtime, which
 * only ever decide something the employee is already watching for): a
 * report like this has no other visible outcome for them to check, so
 * without a push there'd be no way for them to know it was even seen. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: parsed.data.status,
      adminNote: parsed.data.adminNote,
      resolvedAt: parsed.data.status === "RESOLVED" ? new Date() : null,
    },
    select: { id: true, status: true, resolvedAt: true, adminNote: true },
  });

  // Only on a fresh OPEN -> RESOLVED transition, not every PATCH that
  // happens to already be RESOLVED (re-saving a note on an already-resolved
  // ticket shouldn't re-notify) and not on reopen (nothing for the employee
  // to act on there).
  if (parsed.data.status === "RESOLVED" && existing.status !== "RESOLVED") {
    await sendPushNotification(
      existing.userId,
      "Your reported issue was resolved",
      updated.adminNote
        ? `Your admin marked it resolved: ${updated.adminNote}`
        : "Your admin marked it resolved. Reach out again if it's not actually fixed.",
    );
  }

  return NextResponse.json(updated);
}
