import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getLiveSignature, getPendingCounts } from "@/lib/adminCounts";
import { getAdminNotifications } from "@/lib/adminNotifications";
import { checkFaceVerifyHealth } from "@/lib/faceVerify";

export const dynamic = "force-dynamic";

// The face-service check can take a few seconds, and the sidebar asks after every decision and page change,
// so the answer is reused for a short while.
let faceCache: { at: number; value: "ok" | "unreachable" | "not_configured" } | null = null;
async function faceStatus() {
  if (faceCache && Date.now() - faceCache.at < 15_000) return faceCache.value;
  const value = await checkFaceVerifyHealth();
  faceCache = { at: Date.now(), value };
  return value;
}

/**
 * Fresh numbers for the sidebar badges, plus a `signature` that changes whenever new requests, alerts or
 * check-ins arrive, so the open page can refresh itself without the admin reloading it.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [pending, notifications] = await Promise.all([
    getPendingCounts(admin.organizationId),
    faceStatus().then((status) => getAdminNotifications(admin.organizationId, { faceStatus: status })),
  ]);
  const signature = await getLiveSignature(admin.organizationId, notifications.map((n) => n.key));
  return NextResponse.json({ ...pending, notifications: notifications.length, signature });
}
