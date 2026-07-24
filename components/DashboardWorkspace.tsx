"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, CalendarDays, Search, X, Loader2, Download, MapPin } from "lucide-react";
import AttendanceCalendar from "./AttendanceCalendar";
import LocationMapModal from "./LocationMapModal";

type EmployeeLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
};

type EmployeeSummary = {
  id: string;
  employeeCode: string;
  name: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  location: EmployeeLocation | null;
};

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
};

// A ping is considered "live" if it arrived within 3x the 1-minute tracking
// interval — generous enough to tolerate a couple of missed/delayed ticks
// without flickering to Offline.
const LIVE_THRESHOLD_MS = 3 * 60 * 1000;

const TABS = [
  { key: "status", label: "Current Status", icon: Users },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DashboardWorkspace({
  employees: initialEmployees,
}: {
  employees: EmployeeSummary[];
}) {
  const [tab, setTab] = useState<TabKey>("status");
  const [employees, setEmployees] = useState(initialEmployees);

  // Live-updates the Live Location column via Server-Sent Events — no
  // polling, no page refresh. Kept at this level (not inside the Current
  // Status panel) so it keeps receiving updates even while the Calendar tab
  // is active.
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    function applyUpdate(update: { userId: string } & EmployeeLocation) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === update.userId
            ? {
                ...emp,
                location: {
                  latitude: update.latitude,
                  longitude: update.longitude,
                  accuracy: update.accuracy,
                  timestamp: update.timestamp,
                },
              }
            : emp,
        ),
      );
    }

    // SSE has no backlog — any pings published while this connection was
    // down are gone from the stream's perspective. Resync the full snapshot
    // every time a connection opens (initial + every reconnect) to close
    // that gap.
    async function resync() {
      try {
        const res = await fetch("/api/admin/locations/latest");
        if (!res.ok || cancelled) return;
        const data: ({ userId: string } & EmployeeLocation)[] = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        data.forEach(applyUpdate);
      } catch {
        // best-effort — the next SSE push or visibility/online event will retry
      }
    }

    function connect() {
      source = new EventSource("/api/admin/locations/stream");
      // Fires on the initial connection AND every automatic reconnect.
      source.onopen = () => {
        resync();
      };
      source.onmessage = (event) => {
        try {
          applyUpdate(JSON.parse(event.data));
        } catch {
          // ignore malformed events
        }
      };
      // EventSource retries automatically on drop/error — nothing else to do here.
    }

    connect();

    function handleWake() {
      if (document.visibilityState === "hidden") return;
      // A laptop sleeping or a tab being deeply backgrounded can leave the
      // connection silently stale without ever firing a proper error/close —
      // force a fresh one rather than trusting readyState alone.
      source?.close();
      connect();
    }

    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("online", handleWake);
    window.addEventListener("focus", handleWake);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("online", handleWake);
      window.removeEventListener("focus", handleWake);
      source?.close();
    };
  }, []);

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
        {tab === "status" && <CurrentStatusPanel employees={employees} />}
        {tab === "calendar" && <CalendarPanel employees={employees} />}
      </div>
    </div>
  );
}

function formatTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function CurrentStatusPanel({ employees }: { employees: EmployeeSummary[] }) {
  const [viewing, setViewing] = useState<EmployeeSummary | null>(null);

  // Re-evaluate "Live vs Offline" freshness periodically even if no new ping
  // arrives (a stale ping should eventually flip to Offline on its own).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">Current Status</h2>
        <a
          href="/api/admin/attendance/export"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-primary shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>
      <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-secondary text-left border-b border-slate-200/60">
            <tr>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                Employee ID
              </th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Name</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Status</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                Live Location
              </th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">In</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {employees.map((emp) => {
              const isIn = Boolean(emp.checkInAt) && !emp.checkOutAt;
              const isLive =
                isIn && emp.location !== null && now - new Date(emp.location.timestamp).getTime() <= LIVE_THRESHOLD_MS;
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
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-bold">
                        {isLive ? "🟢 Live" : "🔴 Offline"}
                      </span>
                      <span className="text-secondary text-xs">
                        {emp.location
                          ? `Updated ${formatTime(emp.location.timestamp)}`
                          : "No location yet"}
                      </span>
                      <button
                        onClick={() => setViewing(emp)}
                        disabled={!emp.location}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary hover:text-white hover:border-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary"
                      >
                        <MapPin className="w-3 h-3" />
                        View
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-secondary font-medium">
                    {formatTime(emp.checkInAt)}
                  </td>
                  <td className="px-6 py-4 text-secondary font-medium">
                    {formatTime(emp.checkOutAt)}
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-secondary">
                  No active employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && viewing.location && (
        <LocationMapModal
          employeeName={viewing.name}
          latitude={viewing.location.latitude}
          longitude={viewing.location.longitude}
          accuracy={viewing.location.accuracy}
          timestamp={viewing.location.timestamp}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function CalendarPanel({ employees }: { employees: EmployeeSummary[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EmployeeSummary | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter(
        (e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [employees, query]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    fetch(`/api/admin/employees/${selected.id}/attendance`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAttendances(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setAttendances([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-slate-800">Calendar</h2>

      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee by name or ID…"
            className="w-full rounded-lg border border-slate-300 bg-white/80 pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {query && filtered.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100 max-w-sm overflow-hidden">
            {filtered.map((emp) => (
              <button
                key={emp.id}
                onClick={() => {
                  setSelected(emp);
                  setQuery("");
                  setAttendances(null);
                  setLoading(true);
                }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors text-left"
              >
                <span className="font-semibold text-slate-800">{emp.name}</span>
                <span className="text-secondary">{emp.employeeCode}</span>
              </button>
            ))}
          </div>
        )}
        {query && filtered.length === 0 && (
          <p className="text-sm text-secondary max-w-sm">No employees match &quot;{query}&quot;.</p>
        )}

        {selected && (
          <div className="inline-flex items-center gap-2 w-fit rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-sm font-semibold text-primary">
            {selected.name}
            <span className="text-primary/60 font-normal">({selected.employeeCode})</span>
            <button
              onClick={() => {
                setSelected(null);
                setAttendances(null);
              }}
              className="text-primary/60 hover:text-primary"
              aria-label="Clear selected employee"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="max-w-sm rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 p-4">
        {!selected && (
          <p className="text-sm text-secondary text-center py-8">
            Search for an employee above to view their attendance calendar.
          </p>
        )}
        {selected && loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-secondary text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading calendar…
          </div>
        )}
        {selected && !loading && attendances && <AttendanceCalendar attendances={attendances} />}
      </div>
    </div>
  );
}
