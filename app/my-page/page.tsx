import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogIn, LogOut, Clock, CalendarCheck } from "lucide-react";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default async function MyPage() {
  const session = await auth();
  if (!session) return null;

  const records = await prisma.attendance.findMany({
    where: { userId: session.user.id },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  const last = records[0];
  const isIn = last?.type === "CHECK_IN";

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Pair each check-in with the next check-out (chronologically) to total hours worked in the last 7 days.
  let weeklyHours = 0;
  let openCheckIn: Date | null = null;
  for (const r of [...records].reverse()) {
    if (r.type === "CHECK_IN") {
      openCheckIn = r.timestamp;
    } else if (r.type === "CHECK_OUT" && openCheckIn) {
      if (r.timestamp >= weekAgo) {
        weeklyHours += (r.timestamp.getTime() - openCheckIn.getTime()) / (1000 * 60 * 60);
      }
      openCheckIn = null;
    }
  }

  const monthEvents = records.filter((r) => r.timestamp >= monthStart).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-primary/20 shrink-0">
          {initials(session.user.name ?? session.user.employeeCode ?? "?")}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {session.user.name}
          </h1>
          <p className="text-secondary text-sm font-medium">{session.user.employeeCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 backdrop-blur-md p-6 shadow-xl shadow-primary/10 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-primary uppercase tracking-wider">
              Current Status
            </p>
            <span
              className={`w-2.5 h-2.5 rounded-full ${isIn ? "bg-primary animate-pulse" : "bg-slate-400"}`}
            />
          </div>
          <p className="text-2xl font-black mt-4 text-primary">
            {last ? (isIn ? "Checked In" : "Checked Out") : "No activity yet"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">
              Hours (7 days)
            </p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">{weeklyHours.toFixed(1)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20 hover:-translate-y-1 hover:shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-secondary uppercase tracking-wider">
              Events this month
            </p>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-4xl font-black mt-4 text-slate-800">{monthEvents}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-slate-800">Recent Activity</h2>
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-secondary text-left border-b border-slate-200/60">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Photo</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Date</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Time</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Event</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                    No records yet. Use the kiosk to check in.
                  </td>
                </tr>
              )}
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-primary/5 transition-colors duration-200">
                  <td className="px-6 py-4">
                    {r.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/attendance/${r.id}/photo`}
                        alt="Check-in photo"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {new Date(r.timestamp).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(r.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 font-bold ${
                        r.type === "CHECK_IN" ? "text-primary" : "text-slate-500"
                      }`}
                    >
                      {r.type === "CHECK_IN" ? (
                        <LogIn className="w-4 h-4" />
                      ) : (
                        <LogOut className="w-4 h-4" />
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
