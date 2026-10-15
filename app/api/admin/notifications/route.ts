import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isDismissibleKey } from "@/lib/adminNotifications";

export const dynamic = "force-dynamic";

// One notification, or the list of notifications the admin was looking at ("Delete all" sends exactly
// those, so an alert that appeared after the page loaded is not deleted unseen).
const bodySchema = z.union([
  z.object({ key: z.string().min(1).max(200) }),
  z.object({ keys: z.array(z.string().min(1).max(200)).min(1).max(200) }),
]);

/**
 * Deletes a notification (or a list of them) for the whole organization: the next time the dashboard, the
 * Notifications page or the face-service banner is built, those alerts are left out. Requests that need
 * a decision (permission requests) cannot be deleted here, they have to be approved or declined.
 */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const keys = "keys" in parsed.data ? parsed.data.keys : [parsed.data.key];
  if (!keys.every(isDismissibleKey)) {
    return NextResponse.json({ error: "That notification can't be deleted." }, { status: 400 });
  }

  if (keys.length > 0) {
    await prisma.dismissedNotification.createMany({
      data: keys.map((key) => ({ organizationId: admin.organizationId, key, dismissedByName: admin.session.user?.name ?? null })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ deleted: keys.length });
}
