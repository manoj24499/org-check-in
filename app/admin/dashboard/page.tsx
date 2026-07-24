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
      location: locationByUser.get(e.id) ?? null,
    };
  });

  const currentlyIn = employees.filter((e) => e.checkInAt && !e.checkOutAt).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
          Dashboard
        </h1>
        <p className="text-secondary mt-1 font-medium">
          Live attendance overview
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">
              Total Employees
            </p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">
            {employeesRaw.length}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md p-6 shadow-xl shadow-primary/10 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-primary uppercase tracking-wider">
              Currently In
            </p>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m.5-5v1.5a.5.5 0 0 1-1 0V11a.5.5 0 0 1 1 0m0 3a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0" />
                <path d="M12.096 6.223A5 5 0 0 0 13 5.6V4a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V2H7V.5a.5.5 0 0 0-1 0V2H5V.5a.5.5 0 0 0-1 0V2H3a2 2 0 0 0-2 2v1h8.096z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-primary">{currentlyIn}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">
              Today&apos;s Events
            </p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z" />
                <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">
            {todaysEventCount}
          </p>
        </div>
      </div>

      <DashboardWorkspace employees={employees} />
    </div>
  );
}
