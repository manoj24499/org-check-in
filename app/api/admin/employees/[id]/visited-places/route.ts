import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { computeTotalDistanceMeters, clusterPings } from "@/lib/locationClustering";
import { reverseGeocode } from "@/lib/geocoding";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

// `date.toISOString().slice(0, 10)` converts to UTC first — for any
// timezone ahead of UTC (e.g. IST), local midnight rolls back to the
// previous UTC calendar day, silently shifting every date by one. This
// reads the *local* year/month/day directly instead.
function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const day = parseDateParam(req.nextUrl.searchParams.get("date"));

  const [pings, mostRecentPing] = await Promise.all([
    prisma.locationPing.findMany({
      where: { userId: id, timestamp: { gte: startOfDay(day), lte: endOfDay(day) } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.locationPing.findFirst({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
    }),
  ]);

  const totalDistanceMeters = computeTotalDistanceMeters(pings);
  const clusters = clusterPings(pings);

  // Nominatim's ~1 req/sec usage policy is enforced inside reverseGeocode
  // itself via a shared throttle, so firing these concurrently here is
  // still safe — only the (rare) cache-miss lookups actually hit the
  // network, and they get serialized regardless of how they're kicked off.
  const visits = await Promise.all(
    clusters.map(async (cluster) => ({
      latitude: cluster.centroidLatitude,
      longitude: cluster.centroidLongitude,
      arrivedAt: cluster.arrivedAt,
      departedAt: cluster.departedAt,
      placeName: await reverseGeocode(cluster.centroidLatitude, cluster.centroidLongitude),
    })),
  );

  return NextResponse.json({
    date: formatDateKey(day),
    totalDistanceMeters,
    pings: pings.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp })),
    visits,
    mostRecentDataDate: mostRecentPing ? formatDateKey(mostRecentPing.timestamp) : null,
  });
}
