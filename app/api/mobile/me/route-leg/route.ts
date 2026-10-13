import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { getRouteLeg } from "@/lib/routing";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().min(1).max(40),
});

/** The road route with turn instructions from the worker's position to one assigned place (used to re-route). */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const place = await prisma.assignedPlace.findFirst({
    where: { id: parsed.data.placeId, userId: auth.sub, status: "PENDING" },
    select: { id: true, name: true, latitude: true, longitude: true },
  });
  if (!place) return NextResponse.json({ error: "That place is not available." }, { status: 404 });

  const leg = await getRouteLeg({ latitude: parsed.data.latitude, longitude: parsed.data.longitude }, place, place.name);
  return NextResponse.json({ placeId: place.id, leg });
}
