import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrgBySlug } from "@/lib/organization";
import { requireMobileUser } from "@/lib/mobileAuth";

// Public, unauthenticated (same trust model as /api/kiosk/status) — lets the
// kiosk show a live distance indicator before check-in. No sensitive data.
// Resolves its organization from the orgSlug query param (see
// app/kiosk/[orgSlug]), defaulting to "default" for the plain, org-less
// /kiosk route kept for backward compatibility with already-bookmarked
// physical kiosks.
export async function GET(req: NextRequest) {
  // Mobile-app callers are scoped by their bearer token (the app sends no
  // orgSlug); anonymous kiosks resolve from the slug in their URL.
  const auth = await requireMobileUser(req);
  const org = auth
    ? { id: auth.organizationId }
    : await resolveActiveOrgBySlug(req.nextUrl.searchParams.get("orgSlug") ?? "default");
  if (!org) {
    return NextResponse.json({ officeLocation: null });
  }

  const officeLocation = await prisma.officeLocation.findUnique({
    where: { organizationId: org.id },
    select: { name: true, latitude: true, longitude: true, radiusMeters: true },
  });

  return NextResponse.json({ officeLocation });
}
