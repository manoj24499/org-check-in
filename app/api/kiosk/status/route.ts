import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings";
import { requireMobileUser } from "@/lib/mobileAuth";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { haversineDistanceMeters } from "@/lib/geofence";
import { startOfISTDay } from "@/lib/istTime";

// Lightweight, PIN-less lookup so the kiosk can steer an employee to the
// right button (Check In vs Check Out) and warn them about a forgotten
// check-out before they even type their PIN. Two very different callers
// hit this: the anonymous physical kiosk (nobody is logged in yet — that's
// the whole point) and the already-authenticated mobile app's own
// dashboard, which sends its bearer token on every request regardless of
// route. Neither is required to prove who they're asking about via a PIN,
// so both are gated a different way below instead of leaving this fully
// open to "guess anyone's employeeCode from anywhere on the internet".
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`status:${ip}`, 60_000, 60)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const employeeCode = req.nextUrl.searchParams.get("employeeCode")?.trim();
  if (!employeeCode) {
    return NextResponse.json({ exists: false });
  }

  const user = await prisma.user.findUnique({ where: { employeeCode } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ exists: false });
  }

  // Authenticated (mobile app) caller: only ever allowed to look up their
  // own record — the app never asks for anyone else's, so this closes off
  // "use my own login to snoop on a co-worker's name/attendance" for free.
  const auth = await requireMobileUser(req);
  if (auth && auth.sub !== user.id) {
    return NextResponse.json({ exists: false });
  }

  // Anonymous (kiosk) caller: no identity to check, so require the caller
  // to actually be near this employee's assigned location instead — a
  // remote attacker with no GPS proof can no longer enumerate the roster
  // from anywhere on the internet just by guessing employee codes. Mirrors
  // resolveGeofenceTarget's existing "not enforced if nothing is
  // configured" precedent (same as the real check-in gate) so FIELD
  // workers/employees with no location set aren't blocked from a feature
  // that was never gated for them elsewhere either.
  if (!auth) {
    const target = await resolveGeofenceTarget(user);
    if (target) {
      const lat = Number(req.nextUrl.searchParams.get("latitude"));
      const lng = Number(req.nextUrl.searchParams.get("longitude"));
      const withinRadius =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        haversineDistanceMeters(lat, lng, target.latitude, target.longitude) <= target.radiusMeters;
      if (!withinRadius) {
        return NextResponse.json({ exists: false });
      }
    }
  }

  const todaysRecords = await prisma.attendance.findMany({
    where: { userId: user.id, timestamp: { gte: startOfISTDay() } },
    orderBy: { timestamp: "asc" },
  });

  const checkIn = todaysRecords.find((r) => r.type === "CHECK_IN");
  const checkOut = todaysRecords.find((r) => r.type === "CHECK_OUT");
  const settings = await getSettings();

  const isPaused = checkIn
    ? Boolean(
        await prisma.attendancePause.findFirst({
          where: { attendanceId: checkIn.id, resumedAt: null },
        }),
      )
    : false;

  return NextResponse.json({
    exists: true,
    name: user.name,
    workMode: user.workMode,
    checkedIn: Boolean(checkIn),
    checkedOut: Boolean(checkOut),
    checkInAt: checkIn?.timestamp ?? null,
    checkOutPhotoRequired: settings.checkOutPhotoRequired,
    isPaused,
    lateMinutes: checkIn?.lateMinutes ?? null,
    leaveType: checkIn?.leaveType ?? "NONE",
    checkInMode: checkIn?.checkInMode ?? null,
  });
}
