"use client";

import { useState } from "react";
import { ListChecks, CalendarDays, LogIn, LogOut } from "lucide-react";
import AttendanceCalendar from "./AttendanceCalendar";

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
};

const TABS = [
  { key: "activity", label: "Recent Activity", icon: ListChecks },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Full history feeds the Calendar tab (for month browsing); the Recent
// Activity table only ever shows the newest slice of it.
const RECENT_ACTIVITY_LIMIT = 50;

export default function MyPageWorkspace({ records }: { records: AttendanceRecord[] }) {
  const [tab, setTab] = useState<TabKey>("activity");

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <aside className="md:w-56 shrink-0">
        <nav className="flex md:flex-col gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors text-left ${
                tab === key
                  ? "bg-primary/10 text-primary"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {tab === "activity" && <ActivityPanel records={records.slice(0, RECENT_ACTIVITY_LIMIT)} />}
        {tab === "calendar" && (
          <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Attendance Calendar</h2>
            <AttendanceCalendar attendances={records} layout="split" />
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityPanel({ records }: { records: AttendanceRecord[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-slate-800">Recent Activity</h2>
      <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
        <div className="overflow-x-auto">
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
