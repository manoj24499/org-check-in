import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { istDateKey, parseDateOnlyKey } from "@/lib/istTime";
import { toAssignedPlaceDto } from "@/lib/assignedPlaces";

export const dynamic = "force-dynamic";

/** The places an admin assigned to the signed-in field worker for a day (default today), in the saved order. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = req.nextUrl.searchParams.get("date");
  const parsed = requested ? parseDateOnlyKey(requested) : null;
  if (requested && !parsed) return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  const dayKey = parsed ? istDateKey(parsed) : istDateKey();

  const rows = await prisma.assignedPlace.findMany({
    where: { userId: auth.sub, dayKey },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { fieldVisit: { select: { reachedAt: true } } },
  });
  return NextResponse.json({ date: dayKey, places: rows.map(toAssignedPlaceDto) });
}
