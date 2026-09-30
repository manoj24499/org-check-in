import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeOrgSlug, isValidOrgSlug } from "@/lib/orgSlug";
import { findActiveHold } from "@/lib/billing/holds";
import { withCors, corsPreflight } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

/** Live availability check for the registration form's organization-code
 * field — read-only, no side effects, so this is the same trust model as
 * /api/kiosk/status (public, but IP-rate-limited against enumeration). The
 * real uniqueness check that actually matters still happens again inside
 * /api/register itself at submit time. Called cross-origin from the
 * marketing site's own signup form now (see lib/cors.ts) as well as this
 * app's /register. */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`check-slug:${ip}`, 60_000, 30)) {
    return withCors(NextResponse.json({ error: "Too many attempts." }, { status: 429 }));
  }

  const raw = req.nextUrl.searchParams.get("slug");
  if (!raw) {
    return withCors(NextResponse.json({ available: false, reason: "empty" }));
  }

  const slug = normalizeOrgSlug(raw);
  if (!isValidOrgSlug(slug)) {
    return withCors(NextResponse.json({ available: false, reason: "invalid" }));
  }

  const [existing, held] = await Promise.all([
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
    // A slug an in-progress paid checkout is actively holding (see
    // lib/billing/holds.ts) reads the same as "taken" here — a free-trial
    // signup can't be allowed to grab it out from under a paying buyer.
    findActiveHold({ slug }),
  ]);
  const taken = Boolean(existing || held);
  return withCors(NextResponse.json({ available: !taken, reason: taken ? "taken" : null }));
}
