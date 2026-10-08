import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff, Clock, ScanEye, MapPinOff, UserCheck, UserPlus, Users } from "lucide-react";
import { Avatar, BTN_PRIMARY, Card, Page, PageHeader, Pill, StatCard } from "@/components/admin/ui";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import PendingPermissionsPanel from "@/components/PendingPermissionsPanel";
import { startOfISTDay, todayDateOnlyIST } from "@/lib/istTime";
import { istGreeting } from "@/lib/greeting";
import { findSilentFieldWorkers } from "@/lib/trackingWatch";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  // Explicit `select` at both levels — this is the admin's landing page,
  // re-fetched on every navigation to it (`force-dynamic`), and was
  // previously pulling every active employee's full User row (pinHash
  // included) plus every one of today's Attendance rows in full (photo
  // bytes included) just to compute a few booleans and two numbers.
  const employeesRaw = await prisma.user.findMany({
    where: { organizationId, role: "EMPLOYEE", active: true },
    // Join order (oldest first), matching /admin/employees and /admin/shifts.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      attendances: {
        where: { timestamp: { gte: startOfISTDay() } },
        orderBy: { timestamp: "asc" },
        select: { type: true, timestamp: true, lateMinutes: true, leaveType: true },
      },
    },
  });

  // Check-ins from the last 7 days that went through without a face check
  // because the face service could not be reached (fail-open, see
  // lib/faceVerify.ts). Kept here so the record stays visible after the
  // top banner clears itself.
  const missedFaceChecks = await prisma.attendance.findMany({
    where: {
      type: "CHECK_IN",
      faceVerifyStatus: "UNAVAILABLE",
      timestamp: { gte: new Date(startOfISTDay().getTime() - 6 * 24 * 3600 * 1000) },
      user: { organizationId },
    },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true, user: { select: { id: true, name: true, employeeCode: true } } },
    take: 50,
  });
  // Field workers who are checked in but whose phone has stopped sending location.
  const silentWorkers = await findSilentFieldWorkers(organizationId);
  const istWhen = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Most recent location ping per employee (one query via `distinct`, rather
  // than a per-employee lookup).
  const latestPings = await prisma.locationPing.findMany({
    where: { userId: { in: employeesRaw.map((e) => e.id) } },
    orderBy: { timestamp: "desc" },
    distinct: ["userId"],
  });
  const locationByUser = new Map(
    latestPings.map((p) => [
      p.userId,
      {
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy,
        timestamp: p.timestamp.toISOString(),
      },
    ]),
  );

  // Full-day leave covering today, any origin (employee-submitted-and-
  // approved, or admin-quick-marked via /api/admin/employees/[id]/leave-today)
  // — see DashboardWorkspace's leaveBadge/MarkLeaveControl for how this
  // renders. Unrelated to Attendance.leaveType (an auto-computed lateness
  // classification, despite the similar name — see its own schema comment).
  const todayDateOnly = todayDateOnlyIST();
  const leaveTodayRaw = await prisma.timeOffRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: todayDateOnly },
      endDate: { gte: todayDateOnly },
      user: { organizationId },
    },
    select: { id: true, userId: true, type: true, markedByAdmin: true },
  });
  const leaveByUser = new Map(leaveTodayRaw.map((r) => [r.userId, r]));

  const employees = employeesRaw.map((e) => {
    const checkIn = e.attendances.find((a) => a.type === "CHECK_IN");
    const checkOut = e.attendances.find((a) => a.type === "CHECK_OUT");
    const leave = leaveByUser.get(e.id);
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.name,
      checkInAt: checkIn ? checkIn.timestamp.toISOString() : null,
      checkOutAt: checkOut ? checkOut.timestamp.toISOString() : null,
      lateMinutes: checkIn?.lateMinutes ?? null,
      leaveType: checkIn?.leaveType ?? "NONE",
      location: locationByUser.get(e.id) ?? null,
      onLeaveToday: leave
        ? {
            requestId: leave.id,
            type: leave.type,
            isQuickMarked: leave.markedByAdmin,
          }
        : null,
    };
  });

  const currentlyIn = employees.filter((e) => e.checkInAt && !e.checkOutAt).length;
  const lateToday = employees.filter((e) => e.lateMinutes !== null && e.lateMinutes > 0).length;

  const pendingPermissionsRaw = await prisma.timedPermission.findMany({
    where: { approvalStatus: "PENDING", attendance: { user: { organizationId } } },
    orderBy: { createdAt: "asc" },
    include: { attendance: { select: { user: { select: { id: true, employeeCode: true, name: true } } } } },
  });
  const pendingPermissions = pendingPermissionsRaw.map((p) => ({
    id: p.id,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime.toISOString(),
    employee: p.attendance.user,
  }));

  const total = employeesRaw.length;
  const checkedOut = employees.filter((e) => e.checkOutAt).length;
  const onLeave = employees.filter((e) => e.onLeaveToday).length;
  const notIn = employees.filter((e) => !e.checkInAt && !e.onLeaveToday).length;
  const presentPct = total ? Math.round((currentlyIn / total) * 100) : 0;

  const { greeting, dateLabel } = istGreeting();
  const firstName = session.user.name?.trim().split(/\s+/)[0];

  // Today's attendance split, drawn as one stacked bar.
  const segments = [
    { label: "Working", value: currentlyIn, bar: "bg-emerald-500", dot: "bg-emerald-500" },
    { label: "Checked out", value: checkedOut, bar: "bg-slate-400", dot: "bg-slate-400" },
    { label: "On leave", value: onLeave, bar: "bg-indigo-500", dot: "bg-indigo-500" },
    { label: "Not in yet", value: notIn, bar: "bg-amber-400", dot: "bg-amber-400" },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow={dateLabel}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        subtitle="Here is how your team is doing today."
        actions={
          <Link href="/admin/employees" className={BTN_PRIMARY}>
            <UserPlus className="h-4 w-4" />
            Add employee
          </Link>
        }
      />

      {pendingPermissions.length > 0 ? <PendingPermissionsPanel initialPermissions={pendingPermissions} /> : null}

      {silentWorkers.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600">
                <MapPinOff className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Tracking stopped</h2>
                <p className="mt-0.5 max-w-2xl text-[13px] text-slate-500">
                  Checked in on a field day, but the phone has stopped sending location. Their route and distance are not
                  being recorded. They have been sent a reminder; if it keeps happening, check the phone&apos;s battery and
                  location settings.
                </p>
              </div>
            </div>
            <Pill tone="red">{silentWorkers.length} now</Pill>
          </div>
          <ul className="mt-4 divide-y divide-black/[0.06]">
            {silentWorkers.map((w) => (
              <li key={w.attendanceId} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={w.name} size={32} />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/employees/${w.userId}`} className="truncate text-sm font-medium text-slate-900 hover:text-orange-600">
                    {w.name}
                  </Link>
                  <p className="text-xs text-slate-500">{w.employeeCode}</p>
                </div>
                <p className="text-[13px] tabular-nums text-slate-600">
                  {w.lastPingAt
                    ? `Last location ${Math.round(w.silentMs / 60000)} min ago`
                    : `No location since check-in (${Math.round(w.silentMs / 60000)} min)`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={total} icon={Users} tone="indigo" hint="Active on your plan" />
        <StatCard
          label="Working now"
          value={currentlyIn}
          icon={UserCheck}
          tone="green"
          hint={`${presentPct}% of your team is in`}
          progress={presentPct}
        />
        <StatCard
          label="Late today"
          value={lateToday}
          icon={Clock}
          tone="amber"
          hint={lateToday === 0 ? "Everyone is on time" : "Checked in after their shift start"}
        />
        <StatCard
          label="On leave"
          value={onLeave}
          icon={CalendarOff}
          tone="slate"
          hint={onLeave === 0 ? "No one is away today" : "Approved leave covering today"}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Today at a glance</h2>
          <p className="text-[12px] text-slate-500">
            {total} {total === 1 ? "employee" : "employees"}
          </p>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
          {total > 0 &&
            segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className={`${s.bar} first:rounded-l-full last:rounded-r-full`}
                  style={{ width: `${(s.value / total) * 100}%` }}
                  title={`${s.label}: ${s.value}`}
                />
              ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-[13px] text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
              {s.label}
              <span className="font-semibold tabular-nums text-slate-900">{s.value}</span>
            </li>
          ))}
        </ul>
      </Card>

      {missedFaceChecks.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                <ScanEye className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Missed face checks</h2>
                <p className="mt-0.5 max-w-2xl text-[13px] text-slate-500">
                  Check-ins in the last 7 days that went through without a face check, because the face service could not
                  be reached at that moment.
                </p>
              </div>
            </div>
            <Pill tone="amber">{missedFaceChecks.length} in 7 days</Pill>
          </div>
          <ul className="mt-4 divide-y divide-black/[0.06]">
            {missedFaceChecks.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar name={m.user.name} size={32} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/employees/${m.user.id}`}
                    className="truncate text-sm font-medium text-slate-900 hover:text-orange-600"
                  >
                    {m.user.name}
                  </Link>
                  <p className="text-xs text-slate-500">{m.user.employeeCode}</p>
                </div>
                <p className="text-[13px] tabular-nums text-slate-600">{istWhen.format(m.timestamp)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DashboardWorkspace employees={employees} />
    </Page>
  );
}
