import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings";
import { requireMobileUser } from "@/lib/mobileAuth";
import { resolveGeofenceTarget } from "@/lib/geofenceTarget";
import { haversineDistanceMeters } from "@/lib/geofence";
import { startOfISTDay } from "@/lib/istTime";
import { loadShiftAssignments, shiftForDate } from "@/lib/shiftAssignment";
import { findActiveCheckIn } from "@/lib/activeSession";

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

  // Explicit `select` — no photo bytes needed here, but without one Prisma
  // pulls every column including them. This route is polled every ~30s by
  // every actively-checked-in employee's device (see the mobile app's
  // useAttendanceStatus), so pulling full presence-photo blobs on each poll
  // was a real, continuous, unbounded egress cost — the single largest
  // contributor found in an audit of every Attendance query in this app.
  const todaysRecords = await prisma.attendance.findMany({
    where: { userId: user.id, timestamp: { gte: startOfISTDay() } },
    orderBy: { timestamp: "asc" },
    select: { id: true, type: true, timestamp: true, lateMinutes: true, leaveType: true, checkInMode: true },
  });

  let checkIn = todaysRecords.find((r) => r.type === "CHECK_IN");
  const checkOut = todaysRecords.find((r) => r.type === "CHECK_OUT");

  // No check-in among today's own records — still possibly on an overnight
  // shift that started yesterday and hasn't been checked out yet (see
  // lib/activeSession.ts). checkOut stays scoped to today's records either
  // way: findActiveCheckIn already confirmed there's no later CHECK_OUT.
  if (!checkIn) {
    const active = await findActiveCheckIn(user.id);
    if (active) {
      checkIn =
        (await prisma.attendance.findUnique({
          where: { id: active.id },
          select: { id: true, type: true, timestamp: true, lateMinutes: true, leaveType: true, checkInMode: true },
        })) ?? undefined;
    }
  }

  const settings = await getSettings();

  // Fetch every pause today (not just the open one) so the mobile app can
  // compute a live, pause-adjusted "worked so far" figure the same way
  // computeWorkedMs already does for closed sessions — and show a live
  // "outside time" counter for whichever one is still open. Previously this
  // only checked existence and discarded the row(s) entirely.
  const pauses = checkIn
    ? await prisma.attendancePause.findMany({
        where: { attendanceId: checkIn.id },
        select: { pausedAt: true, resumedAt: true },
        orderBy: { pausedAt: "asc" },
      })
    : [];
  const isPaused = pauses.some((p) => p.resumedAt === null);

  // Today's assigned shift end ("HH:mm", IST), if any — same
  // shiftForDate/loadShiftAssignments pair every other shift-aware evaluator
  // in this app already uses (see /api/kiosk/scan, /api/kiosk/location).
  // Reference date is the actual check-in when there is one (matching how
  // the reminder/lateness evaluators resolve "which day's shift" for an
  // already-checked-in employee), falling back to now for the pre-check-in
  // case. Lets the mobile app's overtime-request time picker (which only
  // makes sense once checked in) disable slots at or before this time,
  // instead of offering to "request overtime" starting mid-shift. Null when
  // no shift is assigned that day (e.g. most FIELD workers) — the picker
  // then has no basis to restrict anything.
  const shiftMap = await loadShiftAssignments(user.id);
  const shiftThatDay = shiftForDate(shiftMap, checkIn?.timestamp ?? new Date());

  return NextResponse.json({
    exists: true,
    name: user.name,
    workMode: user.workMode,
    checkedIn: Boolean(checkIn),
    checkedOut: Boolean(checkOut),
    checkInAt: checkIn?.timestamp ?? null,
    checkOutPhotoRequired: settings.checkOutPhotoRequired,
    isPaused,
    pauses,
    lateMinutes: checkIn?.lateMinutes ?? null,
    leaveType: checkIn?.leaveType ?? "NONE",
    checkInMode: checkIn?.checkInMode ?? null,
    shiftEndTime: shiftThatDay?.endTime ?? null,
  });
}
