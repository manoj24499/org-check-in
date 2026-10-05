"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, Download, MapPin, Users } from "lucide-react";
import { Avatar, BTN_SECONDARY, CARD, EmptyState, Pill, SectionTitle, Segmented, TABLE } from "./admin/ui";
import AttendanceCalendar, { type CalendarSpecialDay } from "./AttendanceCalendar";
import LocationMapModal from "./LocationMapModal";
import MarkLeaveControl, { type OnLeaveToday } from "./MarkLeaveControl";

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
  /** A full-day TimeOffRequest (any origin — employee-submitted or
   * admin-quick-marked) approved and covering today, if any — see
   * /api/admin/employees/[id]/leave-today. */
  onLeaveToday: OnLeaveToday | null;
};

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
  faceVerifyStatus?: "NOT_CHECKED" | "MATCHED" | "MISMATCH" | "UNAVAILABLE";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={setTab} />
        {tab === "status" && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download, not a page
          <a href="/api/admin/attendance/export" className={BTN_SECONDARY}>
            <Download className="h-[15px] w-[15px]" />
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

const TIME_OFF_TYPE_LABEL: Record<OnLeaveToday["type"], string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
};

function leaveBadge(leaveType: LeaveType, lateMinutes: number | null, onLeaveToday: OnLeaveToday | null) {
  // A full-day leave takes priority over the auto-computed lateness
  // classification below - the two are unrelated concepts that happen to
  // share a table cell (see the schema comment on TimeOffRequest), but if
  // someone is on leave today that is the more significant thing to show.
  if (onLeaveToday) {
    return <Pill tone="indigo">On leave · {TIME_OFF_TYPE_LABEL[onLeaveToday.type]}</Pill>;
  }
  if (leaveType === "NONE") return <span className="text-xs text-slate-400">—</span>;
  const label = leaveType === "PERMISSION" ? "Permission" : "Half-day leave";
  return (
    <Pill tone={leaveType === "PERMISSION" ? "amber" : "red"}>
      {label}
      {lateMinutes !== null && <span className="opacity-80">· {lateMinutes}m late</span>}
    </Pill>
  );
}

type Filter = "all" | "in" | "out" | "late" | "leave" | "absent";

function CurrentStatusPanel({ employees }: { employees: EmployeeSummary[] }) {
  const [viewing, setViewing] = useState<EmployeeSummary | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Re-evaluate "Live vs Offline" freshness periodically even if no new ping
  // arrives (a stale ping should eventually flip to Offline on its own).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(
    () => ({
      all: employees.length,
      in: employees.filter((e) => e.checkInAt && !e.checkOutAt).length,
      out: employees.filter((e) => e.checkOutAt).length,
      late: employees.filter((e) => (e.lateMinutes ?? 0) > 0).length,
      leave: employees.filter((e) => e.onLeaveToday).length,
      absent: employees.filter((e) => !e.checkInAt && !e.onLeaveToday).length,
    }),
    [employees],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.employeeCode.toLowerCase().includes(q)) return false;
      switch (filter) {
        case "in":
          return Boolean(e.checkInAt) && !e.checkOutAt;
        case "out":
          return Boolean(e.checkOutAt);
        case "late":
          return (e.lateMinutes ?? 0) > 0;
        case "leave":
          return Boolean(e.onLeaveToday);
        case "absent":
          return !e.checkInAt && !e.onLeaveToday;
        default:
          return true;
      }
    });
  }, [employees, query, filter]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in", label: "Working" },
    { key: "out", label: "Checked out" },
    { key: "late", label: "Late" },
    { key: "leave", label: "On leave" },
    { key: "absent", label: "Not in yet" },
  ];

  return (
    <div className={`${CARD} overflow-hidden`}>
      <SectionTitle
        title="Team today"
        hint="Live attendance, refreshed every few seconds"
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or ID…"
            className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset transition-colors ${
                filter === f.key
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${filter === f.key ? "text-white/70" : "text-slate-400"}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={TABLE.wrap}>
        <table className={TABLE.table}>
          <thead className={TABLE.thead}>
            <tr>
              <th className={TABLE.th}>Employee</th>
              <th className={TABLE.th}>Status</th>
              <th className={TABLE.th}>Check-in</th>
              <th className={TABLE.th}>Check-out</th>
              <th className={TABLE.th}>Attendance</th>
              <th className={TABLE.th}>Location</th>
            </tr>
          </thead>
          <tbody className={TABLE.tbody}>
            {visible.map((emp) => {
              const isIn = Boolean(emp.checkInAt) && !emp.checkOutAt;
              const isLive =
                isIn &&
                emp.location !== null &&
                now - new Date(emp.location.timestamp).getTime() <= LIVE_THRESHOLD_MS;
              return (
                <tr key={emp.id} className={TABLE.tr}>
                  <td className={TABLE.td}>
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.name} />
                      <div className="min-w-0 leading-tight">
                        <p className="truncate font-medium text-slate-900">{emp.name}</p>
                        <p className="text-xs text-slate-500">{emp.employeeCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className={TABLE.td}>
                    {isIn ? (
                      <Pill tone="green" dot pulse>
                        Working
                      </Pill>
                    ) : emp.checkOutAt ? (
                      <Pill tone="slate" dot>
                        Checked out
                      </Pill>
                    ) : emp.onLeaveToday ? (
                      <Pill tone="indigo" dot>
                        On leave
                      </Pill>
                    ) : (
                      <Pill tone="amber" dot>
                        Not in yet
                      </Pill>
                    )}
                  </td>
                  <td className={`${TABLE.td} tabular-nums text-slate-700`}>{formatTime(emp.checkInAt)}</td>
                  <td className={`${TABLE.td} tabular-nums text-slate-700`}>{formatTime(emp.checkOutAt)}</td>
                  <td className={TABLE.td}>
                    <div className="flex flex-col items-start gap-1.5">
                      {leaveBadge(emp.leaveType, emp.lateMinutes, emp.onLeaveToday)}
                      <MarkLeaveControl employeeId={emp.id} onLeaveToday={emp.onLeaveToday} />
                    </div>
                  </td>
                  <td className={TABLE.td}>
                    <div className="flex items-center gap-2.5">
                      {isLive ? (
                        <Pill tone="green" dot pulse>
                          Live
                        </Pill>
                      ) : (
                        <Pill tone="slate">Offline</Pill>
                      )}
                      <span className="hidden text-xs text-slate-500 xl:inline">
                        {emp.location ? formatTime(emp.location.timestamp) : "No location yet"}
                      </span>
                      <button
                        onClick={() => setViewing(emp)}
                        disabled={!emp.location}
                        aria-label={`View location of ${emp.name}`}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 bg-white text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-black/10 disabled:hover:text-slate-600"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <EmptyState
            icon={Users}
            title={employees.length === 0 ? "No active employees yet" : "No one matches these filters"}
            text={
              employees.length === 0
                ? "Add your first employee to start seeing live attendance here."
                : "Try a different search or clear the filter."
            }
          />
        )}
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
  const [specialDays, setSpecialDays] = useState<Record<string, CalendarSpecialDay>>({});
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
        if (cancelled) return;
        setAttendances(Array.isArray(data?.attendances) ? data.attendances : []);
        setSpecialDays(data?.specialDays ?? {});
      })
      .catch(() => {
        if (!cancelled) {
          setAttendances([]);
          setSpecialDays({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee by name or ID…"
            className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-9 text-sm placeholder:text-slate-400 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
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
                  setSpecialDays({});
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
                setSpecialDays({});
              }}
              className="text-primary/60 hover:text-primary"
              aria-label="Clear selected employee"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div>
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
          // "split" (grid on the left, month summary + day detail filling
          // the rest) — same layout the employee-detail page and My Page
          // already use. This panel used to be capped at max-w-sm along
          // with everything above it, which made sense when the whole
          // admin shell was itself only 95% width — now that the shell is
          // full-bleed (see app/admin/layout.tsx), that cap just left a
          // narrow calendar floating in a mostly-empty card.
          <AttendanceCalendar attendances={attendances} specialDays={specialDays} layout="split" />
        )}
      </div>
    </div>
  );
}
