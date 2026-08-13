"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, Download, MapPin } from "lucide-react";
import AttendanceCalendar from "./AttendanceCalendar";
import LocationMapModal from "./LocationMapModal";

type EmployeeLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
};

type LeaveType = "NONE" | "PERMISSION" | "HALF_DAY";

type EmployeeSummary = {
  id: string;
  employeeCode: string;
  name: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number | null;
  leaveType: LeaveType;
  location: EmployeeLocation | null;
};

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
  pauses?: { pausedAt: string; resumedAt: string | null }[];
};

// A ping is considered "live" if it arrived within 3x the 1-minute tracking
// interval — generous enough to tolerate a couple of missed/delayed ticks
// without flickering to Offline.
const LIVE_THRESHOLD_MS = 3 * 60 * 1000;

const TABS = [
  { key: "status", label: "Current status" },
  { key: "calendar", label: "Calendar" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function DashboardWorkspace({
  employees: initialEmployees,
}: {
  employees: EmployeeSummary[];
}) {
  const [tab, setTab] = useState<TabKey>("status");
  const [employees, setEmployees] = useState(initialEmployees);

  const applyUpdate = useCallback(
    (update: { userId: string } & EmployeeLocation) => {
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
    },
    [],
  );

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/locations/latest");
      if (!res.ok) return;
      const data: ({ userId: string } & EmployeeLocation)[] = await res.json();
      if (!Array.isArray(data)) return;
      data.forEach(applyUpdate);
    } catch {
      // best-effort — the next poll tick will retry
    }
  }, [applyUpdate]);

  // Baseline refresh every 5 seconds — this is what updates the Live
  // Location column without a manual page refresh. (Previously paired with
  // a Server-Sent Events push for near-instant updates in between ticks,
  // removed: that relied on an in-memory EventEmitter shared between the
  // request publishing a ping and the request holding the SSE connection —
  // not a safe assumption on Vercel's serverless functions, which don't
  // guarantee either request lands on the same instance. This poll was
  // already the only mechanism actually guaranteed to work in production.)
  useEffect(() => {
    const id = setInterval(fetchLatest, 5_000);
    return () => clearInterval(id);
  }, [fetchLatest]);

  // Also resync immediately on wake — a laptop sleeping or a tab being
  // deeply backgrounded can leave data stale until the next poll tick.
  useEffect(() => {
    function handleWake() {
      if (document.visibilityState === "hidden") return;
      fetchLatest();
    }

    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("online", handleWake);
    window.addEventListener("focus", handleWake);

    return () => {
      document.removeEventListener("visibilitychange", handleWake);
      window.removeEventListener("online", handleWake);
      window.removeEventListener("focus", handleWake);
    };
  }, [fetchLatest]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex border border-border rounded-lg overflow-hidden">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 text-[13px] transition-colors border-l border-border first:border-l-0 ${
                tab === key
                  ? "font-medium bg-primary/[0.08] text-primary-dark"
                  : "text-muted hover:bg-black/[0.03]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "status" && (
          <a
            href="/api/admin/attendance/export"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-transparent px-4 py-1.5 text-[13px] font-medium text-primary-dark hover:bg-primary/5 transition-colors"
          >
            <Download className="w-[15px] h-[15px]" />
            Export CSV
          </a>
        )}
      </div>

      {tab === "status" && <CurrentStatusPanel employees={employees} />}
      {tab === "calendar" && <CalendarPanel employees={employees} />}
    </div>
  );
}

function formatTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function leaveBadge(leaveType: LeaveType, lateMinutes: number | null) {
  if (leaveType === "NONE")
    return <span className="text-secondary text-xs">—</span>;
  const label = leaveType === "PERMISSION" ? "Permission" : "Half-day leave";
  const tone =
    leaveType === "PERMISSION"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-600 border-red-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide border ${tone}`}
    >
      {label}
      {lateMinutes !== null && (
        <span className="font-medium opacity-80">· {lateMinutes}m late</span>
      )}
    </span>
  );
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
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-[15px] font-medium text-foreground">Current status</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3f9c5a]" />
          Live
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-secondary text-left border-t border-b border-border-soft">
            <tr>
              <th className="px-4 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Employee ID
              </th>
              <th className="px-3 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Name
              </th>
              <th className="px-3 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Status
              </th>
              <th className="px-3 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Leave
              </th>
              <th className="px-3 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Live Location
              </th>
              <th className="px-3 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                In
              </th>
              <th className="px-4 py-2.5 font-medium uppercase tracking-wider text-[11px]">
                Out
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {employees.map((emp) => {
              const isIn = Boolean(emp.checkInAt) && !emp.checkOutAt;
              const isLive =
                isIn &&
                emp.location !== null &&
                now - new Date(emp.location.timestamp).getTime() <=
                  LIVE_THRESHOLD_MS;
              return (
                <tr
                  key={emp.id}
                  className="hover:bg-primary/5 transition-colors duration-200"
                >
                  <td className="px-4 py-3 text-muted-2">{emp.employeeCode}</td>
                  <td className="px-3 py-3 text-foreground font-medium">
                    {emp.name}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium tracking-wide border ${
                        isIn
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-surface text-secondary border-border"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isIn ? "bg-primary animate-pulse" : "bg-muted"
                        }`}
                      />
                      {isIn ? "Checked In" : "Checked Out"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {leaveBadge(emp.leaveType, emp.lateMinutes)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
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
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <MapPin className="w-3 h-3" />
                        View
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-secondary">
                    {formatTime(emp.checkInAt)}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {formatTime(emp.checkOutAt)}
                  </td>
                </tr>
              );
            })}
            {employees.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-secondary"
                >
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
  const [attendances, setAttendances] = useState<AttendanceRecord[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q),
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
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee by name or ID…"
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted-2"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {query && filtered.length > 0 && (
          <div className="rounded-lg border border-border bg-surface-2 shadow-sm divide-y divide-border-soft max-w-sm overflow-hidden">
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
                <span className="font-medium text-foreground">
                  {emp.name}
                </span>
                <span className="text-secondary">{emp.employeeCode}</span>
              </button>
            ))}
          </div>
        )}
        {query && filtered.length === 0 && (
          <p className="text-sm text-secondary max-w-sm">
            No employees match &quot;{query}&quot;.
          </p>
        )}

        {selected && (
          <div className="inline-flex items-center gap-2 w-fit rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary">
            {selected.name}
            <span className="text-primary/60 font-normal">
              ({selected.employeeCode})
            </span>
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

      <div className="max-w-sm">
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
        {selected && !loading && attendances && (
          <AttendanceCalendar attendances={attendances} />
        )}
      </div>
    </div>
  );
}
