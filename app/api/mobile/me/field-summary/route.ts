import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { haversineDistanceMeters } from "@/lib/geofence";
import { startOfISTDay } from "@/lib/istTime";

// Powers the mobile Map screen's "Field Day" view — distance covered (summed
// from today's location pings, same pings /api/kiosk/location already
// collects) plus the route and any manually-logged visits, all scoped to
// today's CHECK_IN. Returns { active: false } on any day that wasn't a Field
// day (including no check-in yet) — nothing to show in that case.
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todaysCheckIn = await prisma.attendance.findFirst({
    where: { userId: auth.sub, type: "CHECK_IN", timestamp: { gte: startOfISTDay() } },
    orderBy: { timestamp: "desc" },
  });

  if (!todaysCheckIn || todaysCheckIn.checkInMode !== "FIELD") {
    return NextResponse.json({ active: false });
  }

  const [pings, visits] = await Promise.all([
    prisma.locationPing.findMany({
      where: { userId: auth.sub, timestamp: { gte: todaysCheckIn.timestamp } },
      orderBy: { timestamp: "asc" },
      select: { latitude: true, longitude: true, timestamp: true },
    }),
    prisma.fieldVisit.findMany({
      where: { attendanceId: todaysCheckIn.id },
      orderBy: { reachedAt: "asc" },
      select: { id: true, name: true, reachedAt: true, latitude: true, longitude: true, hasPhoto: true },
    }),
  ]);

  let distanceMeters = 0;
  for (let i = 1; i < pings.length; i++) {
    distanceMeters += haversineDistanceMeters(
      pings[i - 1].latitude,
      pings[i - 1].longitude,
      pings[i].latitude,
      pings[i].longitude,
    );
  }

  return NextResponse.json({
    active: true,
    distanceMeters: Math.round(distanceMeters),
    route: pings.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      timestamp: p.timestamp.toISOString(),
    })),
    visits: visits.map((v) => ({
      id: v.id,
      name: v.name,
      reachedAt: v.reachedAt.toISOString(),
      latitude: v.latitude,
      longitude: v.longitude,
      hasPhoto: v.hasPhoto,
    })),
  });
}
