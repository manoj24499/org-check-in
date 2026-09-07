import { prisma } from "@/lib/prisma";
import DashboardWorkspace from "@/components/DashboardWorkspace";
import PendingPermissionsPanel from "@/components/PendingPermissionsPanel";
import { startOfISTDay, todayDateOnlyIST } from "@/lib/istTime";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  // Explicit `select` at both levels — this is the admin's landing page,
  // re-fetched on every navigation to it (`force-dynamic`), and was
  // previously pulling every active employee's full User row (pinHash
  // included) plus every one of today's Attendance rows in full (photo
  // bytes included) just to compute a few booleans and two numbers.
  const employeesRaw = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
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
    where: { status: "APPROVED", startDate: { lte: todayDateOnly }, endDate: { gte: todayDateOnly } },
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
    where: { approvalStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { attendance: { select: { user: { select: { id: true, employeeCode: true, name: true } } } } },
  });
  const pendingPermissions = pendingPermissionsRaw.map((p) => ({
    id: p.id,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime.toISOString(),
    employee: p.attendance.user,
  }));

  return (
    <div className="flex flex-col">
      <div className="px-5 sm:px-7 pt-6 sm:pt-7">
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted mt-1">Live attendance overview</p>
      </div>

      {pendingPermissions.length > 0 ? (
        <div className="px-5 sm:px-7 pt-5">
          <PendingPermissionsPanel initialPermissions={pendingPermissions} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 px-5 sm:px-7 py-5">
        <div className="rounded-lg border border-border bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
            Total employees
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {employeesRaw.length}
          </p>
        </div>
        <div className="rounded-lg border border-primary/35 bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-primary-dark">
            Currently in
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {currentlyIn}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
            Late today
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {lateToday}
          </p>
        </div>
      </div>

      <div className="px-5 sm:px-7 pb-6 sm:pb-7">
        <DashboardWorkspace employees={employees} />
      </div>
    </div>
  );
}
