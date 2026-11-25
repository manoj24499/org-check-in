import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { getSettings } from "@/lib/settings";
import { resolveActiveOrgBySlug } from "@/lib/organization";
import { requireMobileUser } from "@/lib/mobileAuth";
import { requireWebEmployee } from "@/lib/webEmployee";
import { resolveGeofenceTarget, resolveHomeTarget, resolveOfficeLocationTarget } from "@/lib/geofenceTarget";
import { findOpenSegment, HYBRID_TRANSIT_WINDOW_MINUTES, serializeSegment } from "@/lib/hybridSegments";
import { computeSegmentSplit } from "@/lib/attendanceHours";
import { haversineDistanceMeters } from "@/lib/geofence";
import { startOfISTDay, todayDateOnlyIST } from "@/lib/istTime";
import { loadShiftAssignments, shiftForDate } from "@/lib/shiftAssignment";
import { findActiveCheckIn } from "@/lib/activeSession";
import { MAX_RESUMES_PER_DAY } from "@/lib/resumeLimit";
import { combineDateAndShiftEndTime, computeLateness } from "@/lib/shiftTime";
import { checkFaceVerifyHealth } from "@/lib/faceVerify";
import { OFFLINE_MAX_AGE_MINUTES } from "@/lib/offlineCheckIn";
import { resolveKioskDevice } from "@/lib/kioskDevice";

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

  // Authenticated (mobile app) caller: resolve organization from its own
  // bearer token, not the (kiosk-only) orgSlug param below — the mobile app
  // never sends one, and trusting a caller-supplied org for an already-
  // authenticated identity would be backwards. Anonymous (kiosk) caller:
  // resolve from the orgSlug in its URL (see app/kiosk/[orgSlug]), defaulting
  // to "default" for the plain, org-less /kiosk route kept for backward
  // compatibility.
  const auth = (await requireMobileUser(req)) ?? (await requireWebEmployee());
  // A phone that sends a sign-in token which no longer checks out (the access token lasts 15 minutes) must be
  // told so with a 401, so the app refreshes it and asks again. Treating it as an anonymous kiosk instead
  // answered "no such employee", which the app showed as "Not checked in" and a 00:00:00 timer until it was
  // refreshed by hand. The real kiosk sends no Authorization header at all, so it is unaffected.
  if (!auth && req.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = auth
    ? auth.organizationId
    : (await resolveActiveOrgBySlug(req.nextUrl.searchParams.get("orgSlug") ?? "default"))?.id;
  if (!orgId) {
    return NextResponse.json({ exists: false });
  }

  // Anyone can call this without signing in, and employee codes are easy to guess (EMP001, EMP002, ...), so
  // anonymous lookups get a tighter limit than the signed-in app. A kiosk only needs a few per person.
  if (!auth && (await isRateLimited(`status-anon:${ip}`, 60_000, 30))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const user = await prisma.user.findFirst({ where: { organizationId: orgId, employeeCode } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ exists: false });
  }

  // Authenticated (mobile app) caller: only ever allowed to look up their
  // own record — the app never asks for anyone else's, so this closes off
  // "use my own login to snoop on a co-worker's name/attendance" for free.
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
  // A paired kiosk (see KioskDevice) is at the office by definition, so its browser's location isn't needed.
  const pairedKiosk = auth ? null : await resolveKioskDevice(req, orgId);
  if (!auth && !pairedKiosk) {
    const qLat = Number(req.nextUrl.searchParams.get("latitude"));
    const qLng = Number(req.nextUrl.searchParams.get("longitude"));
    const target = await resolveGeofenceTarget(
      user,
      Number.isFinite(qLat) && Number.isFinite(qLng) ? { latitude: qLat, longitude: qLng } : null,
    );
    if (target) {
      const lat = Number(req.nextUrl.searchParams.get("latitude"));
      const lng = Number(req.nextUrl.searchParams.get("longitude"));
      // A PC without GPS locates itself from Wi-Fi or its IP and can be a few hundred metres off, so the reported
      // accuracy (up to 300 m, same limit as the check-in gate) is allowed for. Anything rougher proves nothing.
      const accuracy = Number(req.nextUrl.searchParams.get("accuracy"));
      const tolerance = Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 300 ? accuracy : 0;
      const withinRadius =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        haversineDistanceMeters(lat, lng, target.latitude, target.longitude) - tolerance <= target.radiusMeters;
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

  // The check-out that closes THIS session: one recorded after the check-in. Going by "any check-out dated today"
  // is wrong for an overnight shift — last night's session is closed at, say, 12:30 AM, which falls inside
  // today's date but belongs to yesterday's check-in, and would otherwise make today look already checked out.
  const checkOut = checkIn
    ? todaysRecords.find((r) => r.type === "CHECK_OUT" && r.timestamp > checkIn!.timestamp)
    : todaysRecords.find((r) => r.type === "CHECK_OUT");

  // `user` (and thus its organizationId) is already resolved above.
  const settings = user.organizationId ? await getSettings(user.organizationId) : null;

  // The kiosk has no sign-in, so it only gets what it shows before the PIN: a first-name greeting, whether
  // to offer Check in or Check out, and the check-in time. Full name, shift times, pauses, lateness and
  // leave type stay with the signed-in app, so guessing employee codes reveals as little as possible.
  if (!auth) {
    // Three small, low-sensitivity extras for the kiosk's heads-up notices (no
    // shift times are ever returned): whether a check-in right now would be
    // late (minutes + classification only), whether they're on approved leave
    // today (yes/no), and today's public holiday name (org-wide, not personal).
    const today = todayDateOnlyIST();
    const [holiday, leaveToday, shiftMap] = await Promise.all([
      prisma.publicHoliday.findFirst({
        where: { organizationId: orgId, date: today },
        select: { name: true },
      }),
      prisma.timeOffRequest.findFirst({
        where: { userId: user.id, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
        select: { id: true },
      }),
      checkIn ? Promise.resolve(null) : loadShiftAssignments(user.id),
    ]);
    let lateWarning: { minutes: number; leaveType: "PERMISSION" | "HALF_DAY" } | null = null;
    if (shiftMap && !holiday && !leaveToday) {
      const shift = shiftForDate(shiftMap, new Date());
      const lateness = computeLateness({ workMode: user.workMode, shift }, new Date(), settings?.lateThresholdMinutes ?? 0);
      if (lateness.lateMinutes && lateness.lateMinutes > 0 && lateness.leaveType !== "NONE") {
        lateWarning = { minutes: lateness.lateMinutes, leaveType: lateness.leaveType };
      }
    }

    // Only meaningful for someone who has face verification on: if the service can't be reached right
    // now, the check-in still goes through but is flagged for the admin, so tell them up front.
    const faceCheckUnavailable = user.faceVerificationEnabled && (await checkFaceVerifyHealth()) === "unreachable";

    return NextResponse.json({
      exists: true,
      faceCheckUnavailable,
      lateWarning,
      onLeaveToday: Boolean(leaveToday),
      publicHoliday: holiday?.name ?? null,
      name: user.name.trim().split(/\s+/)[0],
      workMode: user.workMode,
      checkedIn: Boolean(checkIn),
      checkedOut: Boolean(checkOut),
      checkInAt: checkIn?.timestamp ?? null,
      checkOutPhotoRequired: settings?.checkOutPhotoRequired ?? false,
    });
  }

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

  // The open work segment of the current session (FIELD and HYBRID only —
  // everyone else has none), same shape as GET /api/mobile/me/work-segment.
  const sessionOpen = Boolean(checkIn) && !checkOut;
  const openSegment = sessionOpen && checkIn ? await findOpenSegment(checkIn.id) : null;

  // HYBRID: both places plus whether the phone must keep sending location —
  // always while checked in, since the pings are what detect departures and
  // arrivals. Null for every other workMode.
  // segmentMinutes: today's session so far (up to check-out, or now) — lets
  // the app show live hours without counting transit.
  let segmentMinutes: { officeMinutes: number; homeMinutes: number; transitMinutes: number } | null = null;
  if (user.workMode === "HYBRID" && checkIn) {
    const segments = await prisma.workSegment.findMany({
      where: { attendanceId: checkIn.id },
      select: { mode: true, startedAt: true, endedAt: true },
    });
    const split = computeSegmentSplit(checkIn.timestamp, checkOut?.timestamp ?? new Date(), segments, pauses);
    segmentMinutes = {
      officeMinutes: Math.round(split.officeMs / 60_000),
      homeMinutes: Math.round(split.homeMs / 60_000),
      transitMinutes: Math.round(split.transitMs / 60_000),
    };
  }
  const hybrid =
    user.workMode === "HYBRID"
      ? {
          officeTarget: user.organizationId ? await resolveOfficeLocationTarget(user.organizationId) : null,
          homeTarget: resolveHomeTarget(user),
          trackingRequired: sessionOpen,
          transitWindowMinutes: HYBRID_TRANSIT_WINDOW_MINUTES,
          segmentMinutes,
        }
      : null;

  // "Resume work": checked out earlier today, not used yet, and the shift hasn't ended (the automatic check-out
  // would close it again straight away).
  let canResume = false;
  let resumeUsed = false;
  if (checkIn && checkOut) {
    try {
      resumeUsed =
        (await prisma.attendanceResume.count({ where: { attendanceId: checkIn.id } })) >= MAX_RESUMES_PER_DAY;
      const shiftEnd = shiftThatDay ? combineDateAndShiftEndTime(checkIn.timestamp, shiftThatDay) : null;
      canResume = !resumeUsed && (!shiftEnd || Date.now() < shiftEnd.getTime());
    } catch (err) {
      // The table only exists once its migration has been applied; until then, resuming is simply not offered
      // (this route is polled by every signed-in phone and must never fail because of it).
      console.warn("[status] resume lookup failed:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    exists: true,
    name: user.name,
    workMode: user.workMode,
    canResume,
    resumeUsed,
    checkedIn: Boolean(checkIn),
    checkedOut: Boolean(checkOut),
    checkInAt: checkIn?.timestamp ?? null,
    checkOutPhotoRequired: settings?.checkOutPhotoRequired ?? false,
    offlineCheckInEnabled: settings?.offlineCheckInEnabled ?? true,
    offlineMaxAgeMinutes: OFFLINE_MAX_AGE_MINUTES,
    isPaused,
    pauses,
    lateMinutes: checkIn?.lateMinutes ?? null,
    leaveType: checkIn?.leaveType ?? "NONE",
    checkInMode: checkIn?.checkInMode ?? null,
    shiftStartTime: shiftThatDay?.startTime ?? null,
    shiftEndTime: shiftThatDay?.endTime ?? null,
    segment: openSegment ? serializeSegment(openSegment) : null,
    hybrid,
  });
}
