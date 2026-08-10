import { prisma } from "@/lib/prisma";
import DashboardWorkspace from "@/components/DashboardWorkspace";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AdminDashboard() {
  const employeesRaw = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
    include: {
      attendances: {
        where: { timestamp: { gte: startOfToday() } },
        orderBy: { timestamp: "asc" },
      },
    },
  });

  const todaysEventCount = await prisma.attendance.count({
    where: { timestamp: { gte: startOfToday() } },
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

  const employees = employeesRaw.map((e) => {
    const checkIn = e.attendances.find((a) => a.type === "CHECK_IN");
    const checkOut = e.attendances.find((a) => a.type === "CHECK_OUT");
    return {
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.name,
      checkInAt: checkIn ? checkIn.timestamp.toISOString() : null,
      checkOutAt: checkOut ? checkOut.timestamp.toISOString() : null,
      lateMinutes: checkIn?.lateMinutes ?? null,
      leaveType: checkIn?.leaveType ?? "NONE",
      location: locationByUser.get(e.id) ?? null,
    };
  });

  const currentlyIn = employees.filter((e) => e.checkInAt && !e.checkOutAt).length;

  const fieldEmployees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true, workMode: "FIELD" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });

  return (
    <div className="flex flex-col">
      <div className="px-5 sm:px-7 pt-6 sm:pt-7">
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
          Dashboard
        </h1>
        <p className="text-sm text-muted mt-1">Live attendance overview</p>
      </div>

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
            Today&apos;s events
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {todaysEventCount}
          </p>
        </div>
      </div>

      <div className="px-5 sm:px-7 pb-6 sm:pb-7">
        <DashboardWorkspace employees={employees} fieldEmployees={fieldEmployees} />
      </div>
    </div>
  );
}
