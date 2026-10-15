import { NextRequest, NextResponse } from "next/server";
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

// Every open admin tab asks every 15 seconds and each answer takes about eight queries. The answer is shared
// per organization for a few seconds (and one in-flight computation is reused), so several tabs or admins
// cost one set of queries, not one each. This keeps well inside the database's small connection pool.
const RESULT_TTL_MS = 5_000;
const results = new Map<string, { at: number; value: Promise<Record<string, unknown>> }>();

async function compute(organizationId: string) {
  const [pending, notifications] = await Promise.all([
    getPendingCounts(organizationId),
    faceStatus().then((status) => getAdminNotifications(organizationId, { faceStatus: status })),
  ]);
  const signature = await getLiveSignature(organizationId, notifications.map((n) => n.key));
  return { ...pending, notifications: notifications.length, signature };
}

/**
 * Fresh numbers for the sidebar badges, plus a `signature` that changes whenever new requests, alerts or
 * check-ins arrive, so the open page can refresh itself without the admin reloading it.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The page asks again right after the admin approves or deletes something, so that call skips the cache.
  const fresh = req.nextUrl.searchParams.has("fresh");
  const cached = results.get(admin.organizationId);
  if (!fresh && cached && Date.now() - cached.at < RESULT_TTL_MS) {
    return NextResponse.json(await cached.value);
  }
  const value = compute(admin.organizationId);
  results.set(admin.organizationId, { at: Date.now(), value });
  value.catch(() => results.delete(admin.organizationId));
  return NextResponse.json(await value);
}
