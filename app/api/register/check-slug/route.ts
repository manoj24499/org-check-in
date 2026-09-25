import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeOrgSlug, isValidOrgSlug } from "@/lib/orgSlug";

/** Live availability check for the registration form's organization-code
 * field — read-only, no side effects, so this is the same trust model as
 * /api/kiosk/status (public, but IP-rate-limited against enumeration). The
 * real uniqueness check that actually matters still happens again inside
 * /api/register itself at submit time. */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`check-slug:${ip}`, 60_000, 30)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const raw = req.nextUrl.searchParams.get("slug");
  if (!raw) {
    return NextResponse.json({ available: false, reason: "empty" });
  }

  const slug = normalizeOrgSlug(raw);
  if (!isValidOrgSlug(slug)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  return NextResponse.json({ available: !existing, reason: existing ? "taken" : null });
}
