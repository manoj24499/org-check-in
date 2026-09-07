import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { istDateKey, parseDateOnlyKey } from "@/lib/istTime";
import { computeTotalDistanceMeters } from "@/lib/locationClustering";

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

// Below this, a day's summed point-to-point GPS distance is more likely
// stationary drift (accumulated jitter while sitting still, easily tens of
// meters over a day of pings) than a real trip — same order of magnitude as
// the smallest genuine travel day seen in practice (a short local visit),
// comfortably above the noise floor seen on days with no real movement.
const MIN_TRAVEL_DISTANCE_METERS = 300;

/**
 * Which calendar days (within one "YYYY-MM" month) count as "traveled" for
 * this employee — powers the highlight dot in VisitDatePicker, so an admin
 * browsing a field worker's calendar can see at a glance which days had
 * real field activity instead of clicking through every date to check.
 *
 * Two independent signals, either one counts:
 *  - A manually-logged FieldVisit that day (see /api/mobile/field-visits) —
 *    always counts regardless of GPS distance, since a single on-site stop
 *    can have very little movement between pings.
 *  - Total GPS-tracked distance that day (same computeTotalDistanceMeters
 *    used by the day-detail map/reimbursement view) at or above
 *    MIN_TRAVEL_DISTANCE_METERS — catches real travel days with no manually
 *    logged stop at all, which turned out to be the common case in
 *    practice: most field employees never use the manual "log a visit"
 *    action, so FieldVisit alone badly under-reports actual travel.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const month = req.nextUrl.searchParams.get("month");
  if (!month || !MONTH_PATTERN.test(month)) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }

  const traveledDays = new Set<string>();

  // FieldVisit signal — Attendance.dayKey is already the correct IST
  // calendar-day string computed once at write time, so matching "2026-09"
  // as a prefix directly sidesteps the whole UTC/IST month-boundary problem
  // a `timestamp` range here would reintroduce (see lib/istTime.ts's own
  // comments on exactly this class of bug elsewhere in this app).
  const attendancesWithVisits = await prisma.attendance.findMany({
    where: { userId: id, dayKey: { startsWith: month }, fieldVisits: { some: {} } },
    select: { dayKey: true },
    distinct: ["dayKey"],
  });
  for (const a of attendancesWithVisits) traveledDays.add(a.dayKey);

  // GPS-distance signal — LocationPing has no dayKey of its own (only a raw
  // timestamp), so the query window is padded a day on each side and every
  // ping is re-bucketed by its own correct istDateKey() below, discarding
  // anything that lands outside the requested month once correctly bucketed.
  const monthStart = parseDateOnlyKey(`${month}-01`);
  if (monthStart) {
    const queryStart = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000);
    const queryEnd = new Date(monthStart);
    queryEnd.setUTCMonth(queryEnd.getUTCMonth() + 1);
    queryEnd.setTime(queryEnd.getTime() + 24 * 60 * 60 * 1000);

    const pings = await prisma.locationPing.findMany({
      where: { userId: id, timestamp: { gte: queryStart, lt: queryEnd } },
      select: { latitude: true, longitude: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    });

    const pingsByDay = new Map<string, { latitude: number; longitude: number; timestamp: Date }[]>();
    for (const p of pings) {
      const day = istDateKey(p.timestamp);
      if (!day.startsWith(month)) continue;
      const list = pingsByDay.get(day);
      if (list) list.push(p);
      else pingsByDay.set(day, [p]);
    }
    for (const [day, dayPings] of pingsByDay) {
      if (computeTotalDistanceMeters(dayPings) >= MIN_TRAVEL_DISTANCE_METERS) traveledDays.add(day);
    }
  }

  return NextResponse.json({ days: [...traveledDays] });
}
