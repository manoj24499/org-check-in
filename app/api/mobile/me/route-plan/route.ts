import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { istDateKey } from "@/lib/istTime";
import { planVisitOrder, toAssignedPlaceDto } from "@/lib/assignedPlaces";
import { getRouteLeg } from "@/lib/routing";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Optional: plan only these places (otherwise every pending place for today).
  placeIds: z.array(z.string().min(1).max(40)).max(60).optional(),
});

/**
 * Re-plans the worker's remaining places from where they are right now: nearest first, then the
 * nearest to that one, and so on, with the road route to the first one. The app calls this when the
 * list is opened and again after each place is visited or skipped.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const here = { latitude: parsed.data.latitude, longitude: parsed.data.longitude };

  const pending = await prisma.assignedPlace.findMany({
    where: {
      userId: auth.sub,
      dayKey: istDateKey(),
      status: "PENDING",
      ...(parsed.data.placeIds ? { id: { in: parsed.data.placeIds } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (pending.length === 0) return NextResponse.json({ roads: false, ordered: [], next: null });

  const plan = await planVisitOrder(here, pending);
  const first = plan.ordered[0].stop;
  const leg = await getRouteLeg(here, first, first.name);

  return NextResponse.json({
    roads: plan.roads,
    ordered: plan.ordered.map((p) => ({
      ...toAssignedPlaceDto(p.stop),
      distanceMeters: p.distanceMeters,
      durationSeconds: p.durationSeconds,
    })),
    next: { placeId: first.id, leg },
  });
}
