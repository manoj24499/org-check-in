import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveActiveOrgBySlug } from "@/lib/organization";

// Public, unauthenticated (same trust model as /api/kiosk/status) — lets the
// kiosk show a live distance indicator before check-in. No sensitive data.
// Resolves its organization from the orgSlug query param (see
// app/kiosk/[orgSlug]), defaulting to "default" for the plain, org-less
// /kiosk route kept for backward compatibility with already-bookmarked
// physical kiosks.
export async function GET(req: NextRequest) {
  const orgSlug = req.nextUrl.searchParams.get("orgSlug") ?? "default";
  const org = await resolveActiveOrgBySlug(orgSlug);
  if (!org) {
    return NextResponse.json({ officeLocation: null });
  }

  const officeLocation = await prisma.officeLocation.findUnique({
    where: { organizationId: org.id },
    select: { name: true, latitude: true, longitude: true, radiusMeters: true },
  });

  return NextResponse.json({ officeLocation });
}
