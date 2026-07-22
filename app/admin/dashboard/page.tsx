import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AdminDashboard() {
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true },
    orderBy: { name: "asc" },
    include: {
      attendances: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });

  const todaysRecords = await prisma.attendance.findMany({
    where: { timestamp: { gte: startOfToday() } },
    orderBy: { timestamp: "desc" },
    include: { user: true },
  });

  const currentlyIn = employees.filter(
    (e) => e.attendances[0]?.type === "CHECK_IN"
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
        <p className="text-secondary mt-1 font-medium">Live attendance overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">Total Employees</p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/></svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">{employees.length}</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md p-6 shadow-xl shadow-primary/10 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-primary uppercase tracking-wider">Currently In</p>
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m.5-5v1.5a.5.5 0 0 1-1 0V11a.5.5 0 0 1 1 0m0 3a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0"/><path d="M12.096 6.223A5 5 0 0 0 13 5.6V4a2 2 0 0 0-2-2h-1V.5a.5.5 0 0 0-1 0V2H7V.5a.5.5 0 0 0-1 0V2H5V.5a.5.5 0 0 0-1 0V2H3a2 2 0 0 0-2 2v1h8.096z"/></svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-primary">{currentlyIn}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">Today&apos;s Events</p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">{todaysRecords.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-slate-800">Current Status</h2>
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-secondary text-left border-b border-slate-200/60">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Employee ID</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Name</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Status</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {employees.map((emp) => {
                const last = emp.attendances[0];
                const isIn = last?.type === "CHECK_IN";
                return (
                  <tr key={emp.id} className="hover:bg-primary/5 transition-colors duration-200">
                    <td className="px-6 py-4 font-medium text-slate-700">{emp.employeeCode}</td>
                    <td className="px-6 py-4 text-slate-800 font-semibold">{emp.name}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold tracking-wide border ${
                          isIn
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-slate-100 text-secondary border-slate-200"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isIn ? "bg-primary animate-pulse" : "bg-slate-400"
                          }`}
                        />
                        {isIn ? "Checked In" : "Checked Out"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-secondary font-medium">
                      {last ? new Date(last.timestamp).toLocaleString(undefined, { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      }) : "—"}
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                    No active employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Today&apos;s Activity</h2>
          <a
            href="/api/admin/attendance/export"
            className="inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
          >
            <svg className="w-4 h-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </a>
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-secondary text-left border-b border-slate-200/60">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Time</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Employee</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Event</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {todaysRecords.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-secondary">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <svg className="w-8 h-8 text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      No activity yet today.
                    </div>
                  </td>
                </tr>
              )}
              {todaysRecords.map((r) => (
                <tr key={r.id} className="hover:bg-primary/5 transition-colors duration-200">
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {new Date(r.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    {r.user.name} <span className="text-secondary font-medium ml-1">({r.user.employeeCode})</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 font-bold ${r.type === 'CHECK_IN' ? 'text-primary' : 'text-slate-500'}`}>
                      {r.type === "CHECK_IN" ? (
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                      )}
                      {r.type === "CHECK_IN" ? "Check In" : "Check Out"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 border border-slate-200">
                      {r.method}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
