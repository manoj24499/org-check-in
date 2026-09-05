import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { computeTotalDistanceMeters, clusterPings } from "@/lib/locationClustering";
import { reverseGeocode } from "@/lib/geocoding";
import { getSettings } from "@/lib/settings";
import { computeFieldOfficeSplit } from "@/lib/attendanceHours";
import { startOfISTDay, endOfISTDay, istDateKey, parseDateOnlyKey, todayDateOnlyIST } from "@/lib/istTime";

// `day` is a date-only value (UTC midnight of the picked calendar date), so
// it always falls inside the correct IST calendar day — startOfISTDay/
// endOfISTDay on it recovers the true IST day window to query real
// timestamps (LocationPing/Attendance) against. Previously this used the
// server's local clock for both the window and the display formatting
// (`date.getFullYear()` etc., despite that comment's intent to avoid exactly
// this class of bug) — a no-op on Vercel's UTC clock, but wrong the moment
// the server's timezone isn't UTC, and always wrong for `mostRecentDataDate`
// below, which formats a real timestamp rather than this date-only `day`.
function parseDateParam(value: string | null): Date {
  if (!value) return todayDateOnlyIST();
  return parseDateOnlyKey(value) ?? todayDateOnlyIST();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const day = parseDateParam(req.nextUrl.searchParams.get("date"));

  const [pings, mostRecentPing, dayRecords, settings, existingReimbursement] = await Promise.all([
    prisma.locationPing.findMany({
      where: { userId: id, timestamp: { gte: startOfISTDay(day), lte: endOfISTDay(day) } },
      orderBy: { timestamp: "asc" },
    }),
    prisma.locationPing.findFirst({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
    }),
    prisma.attendance.findMany({
      where: { userId: id, timestamp: { gte: startOfISTDay(day), lte: endOfISTDay(day) } },
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        type: true,
        timestamp: true,
        pauses: { select: { pausedAt: true, resumedAt: true } },
        workSegments: { select: { mode: true, startedAt: true, endedAt: true } },
      },
    }),
    getSettings(),
    // Reimbursement.date is that same date-only key, unchanged — no
    // IST-window conversion here (see reimbursement/route.ts).
    prisma.reimbursement.findUnique({ where: { userId_date: { userId: id, date: day } } }),
  ]);

  const todaysCheckIns = dayRecords.filter((r) => r.type === "CHECK_IN");
  const checkIn = todaysCheckIns[0];
  const checkOut = dayRecords.find(
    (r) => r.type === "CHECK_OUT" && r.timestamp > (checkIn?.timestamp ?? startOfISTDay(day)),
  );

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
        select: { id: true, name: true, reachedAt: true, latitude: true, longitude: true, hasPhoto: true },
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
    date: istDateKey(day),
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
      hasPhoto: v.hasPhoto,
    })),
    mostRecentDataDate: mostRecentPing ? istDateKey(mostRecentPing.timestamp) : null,
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
