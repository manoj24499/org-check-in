import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { computeTotalDistanceMeters, clusterPings } from "@/lib/locationClustering";
import { reverseGeocode } from "@/lib/geocoding";
import { buildPlaces, shortPlaceName } from "@/lib/visitedPlaces";
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
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const employee = await prisma.user.findUnique({
    where: { id, organizationId: admin.organizationId },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "Not found." }, { status: 404 });

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
        odometerKm: true,
        pauses: { select: { pausedAt: true, resumedAt: true } },
        workSegments: { select: { mode: true, startedAt: true, endedAt: true } },
      },
    }),
    getSettings(admin.organizationId),
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
        select: { id: true, name: true, description: true, contactName: true, contactPhone: true, contactEmail: true, remarks: true, reachedAt: true, latitude: true, longitude: true, hasPhoto: true },
      })
    : [];

  const totalDistanceMeters = computeTotalDistanceMeters(pings);

  // Raw GPS stops are merged into distinct places (see lib/visitedPlaces.ts) so
  // a worker circling one site is one place, not a pile of pins. Only these
  // merged places are reverse-geocoded; Nominatim's ~1 req/sec policy is
  // enforced inside reverseGeocode itself, and a place the employee logged by
  // hand uses their own name, so it needs no lookup at all.
  const groups = buildPlaces(clusterPings(pings), fieldVisits);
  const places = await Promise.all(
    groups.map(async (g, i) => {
      const loggedName = g.logged[0]?.name ?? null;
      const geocoded = loggedName ? null : shortPlaceName(await reverseGeocode(g.latitude, g.longitude));
      return {
        order: i + 1,
        latitude: g.latitude,
        longitude: g.longitude,
        name: loggedName ?? geocoded ?? "Unnamed place",
        arrivedAt: g.arrivedAt,
        departedAt: g.departedAt,
        durationMs: g.durationMs,
        stays: g.stays,
        logged: g.logged.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description,
          contactName: v.contactName,
          contactPhone: v.contactPhone,
          contactEmail: v.contactEmail,
          remarks: v.remarks,
          reachedAt: v.reachedAt,
          hasPhoto: v.hasPhoto,
        })),
      };
    }),
  );

  const firstPing = pings[0];
  const lastPing = pings[pings.length - 1];

  return NextResponse.json({
    date: istDateKey(day),
    totalDistanceMeters,
    hoursSplit: hoursSplit
      ? { fieldHours: hoursSplit.fieldMs / 3_600_000, officeHours: hoursSplit.officeMs / 3_600_000 }
      : null,
    pings: pings.map((p) => ({ latitude: p.latitude, longitude: p.longitude, timestamp: p.timestamp })),
    places,
    start: firstPing ? { latitude: firstPing.latitude, longitude: firstPing.longitude, timestamp: firstPing.timestamp } : null,
    end: lastPing && pings.length > 1 ? { latitude: lastPing.latitude, longitude: lastPing.longitude, timestamp: lastPing.timestamp } : null,
    odometer:
      checkIn?.odometerKm != null || checkOut?.odometerKm != null
        ? {
            startKm: checkIn?.odometerKm ?? null,
            endKm: checkOut?.odometerKm ?? null,
            distanceKm:
              checkIn?.odometerKm != null && checkOut?.odometerKm != null
                ? Math.round((checkOut.odometerKm - checkIn.odometerKm) * 10) / 10
                : null,
          }
        : null,
    checkInAt: checkIn?.timestamp ?? null,
    checkOutAt: checkOut?.timestamp ?? null,
    fieldVisits: fieldVisits.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
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
