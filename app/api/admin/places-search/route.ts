import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { searchPlaces } from "@/lib/placeSearch";

export const dynamic = "force-dynamic";

/** Forward search for the "assign places" screen: a typed name or address -> candidate places. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 3) return NextResponse.json({ results: [] });

  // Rank results near the organization's office first.
  const office = await prisma.officeLocation.findUnique({
    where: { organizationId: admin.organizationId },
    select: { latitude: true, longitude: true },
  });
  try {
    const results = await searchPlaces(q, office ?? undefined);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Search is unavailable right now." }, { status: 502 });
  }
}
