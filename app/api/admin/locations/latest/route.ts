import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    select: {
      id: true,
      locationPings: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });

  const latest = employees
    .filter((e) => e.locationPings.length > 0)
    .map((e) => {
      const ping = e.locationPings[0];
      return {
        userId: e.id,
        latitude: ping.latitude,
        longitude: ping.longitude,
        accuracy: ping.accuracy,
        timestamp: ping.timestamp.toISOString(),
      };
    });

  return NextResponse.json(latest);
}
