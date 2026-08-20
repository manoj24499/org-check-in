import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { computeTotalDistanceMeters, clusterPings } from "@/lib/locationClustering";
import { reverseGeocode } from "@/lib/geocoding";
import { getSettings } from "@/lib/settings";
import { computeFieldOfficeSplit } from "@/lib/attendanceHours";

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

  const [pings, mostRecentPing, dayRecords, settings, existingReimbursement] = await Promise.all([
    prisma.locationPing.findMany({
      where: { userId: id, timestamp: { gte: startOfDay(day), lte: endOfDay(day) } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.locationPing.findFirst({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
    }),
    prisma.attendance.findMany({
      where: { userId: id, timestamp: { gte: startOfDay(day), lte: endOfDay(day) } },
      orderBy: { timestamp: "asc" },
      include: { pauses: true, workSegments: true },
    }),
    getSettings(),
    prisma.reimbursement.findUnique({ where: { userId_date: { userId: id, date: startOfDay(day) } } }),
  ]);

  const todaysCheckIns = dayRecords.filter((r) => r.type === "CHECK_IN");
  const checkIn = todaysCheckIns[0];
  const checkOut = dayRecords.find((r) => r.type === "CHECK_OUT" && r.timestamp > (checkIn?.timestamp ?? day));

  // Field/Office hour split — only meaningful once the day has actually
  // ended (checked out); a still-open segment would otherwise keep growing
  // every time this is viewed, which isn't a "today's totals so far" view
  // anywhere else in the app either.
  const hoursSplit =
    checkIn && checkOut
      ? computeFieldOfficeSplit(
          checkIn.timestamp,
          checkOut.timestamp,
          checkIn.workSegments.map((s) => ({ mode: s.mode, startedAt: s.startedAt, endedAt: s.endedAt })),
          checkIn.pauses,
        )
      : null;

  // Manually-logged stops (see /api/mobile/field-visits) — distinct from the
  // auto-clustered `visits` below, which infers stops from raw GPS pings.
  const fieldVisits = todaysCheckIns.length
    ? await prisma.fieldVisit.findMany({
        where: { attendanceId: { in: todaysCheckIns.map((c) => c.id) } },
        orderBy: { reachedAt: "asc" },
        select: { id: true, name: true, reachedAt: true, latitude: true, longitude: true },
      })
    : [];

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
    hoursSplit: hoursSplit
      ? { fieldHours: hoursSplit.fieldMs / 3_600_000, officeHours: hoursSplit.officeMs / 3_600_000 }
      : null,
    pings: pings.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp })),
    visits,
    fieldVisits: fieldVisits.map((v) => ({
      id: v.id,
      name: v.name,
      reachedAt: v.reachedAt,
      latitude: v.latitude,
      longitude: v.longitude,
    })),
    mostRecentDataDate: mostRecentPing ? formatDateKey(mostRecentPing.timestamp) : null,
    defaultRatePerKm: settings.reimbursementRatePerKm,
    reimbursement: existingReimbursement
      ? {
          distanceKm: existingReimbursement.distanceKm,
          ratePerKm: existingReimbursement.ratePerKm,
          amount: existingReimbursement.amount,
          note: existingReimbursement.note,
        }
      : null,
  });
}
