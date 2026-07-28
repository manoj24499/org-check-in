import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated (same trust model as /api/kiosk/status) — lets the
// kiosk show a live distance indicator before check-in. No sensitive data.
export async function GET() {
  const officeLocation = await prisma.officeLocation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true, latitude: true, longitude: true, radiusMeters: true },
  });

  return NextResponse.json({ officeLocation });
}
