"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarDays, ChevronDown, Clock, MapPinned, Route, Search, TriangleAlert } from "lucide-react";
import VisitDatePicker from "./VisitDatePicker";
import FullscreenMapFrame from "./FullscreenMapFrame";
import { Avatar, CARD, EmptyState, Pill } from "./admin/ui";
import type { TrailPoint } from "./VisitedPlacesMap";

const VisitedPlacesMap = dynamic(() => import("./VisitedPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

interface HistoryEmployee {
  id: string;
  name: string;
  employeeCode: string;
  workMode: string;
}

interface DayResponse {
  date: string;
  workMode: string;
  pings: { latitude: number; longitude: number; timestamp: string }[];
  pingCount: number;
  gaps: { from: string; to: string; minutes: number; straightMeters: number }[];
  trackingCoveragePct: number | null;
  start: TrailPoint | null;
  end: TrailPoint | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  segments: { mode: string; startedAt: string; endedAt: string | null }[];
  mostRecentDataDate: string | null;
}

const MODE_LABEL: Record<string, string> = { OFFICE: "Office", HOME: "Home", TRANSIT: "In transit", FIELD: "Field" };
const MODE_TONE: Record<string, "orange" | "green" | "amber" | "slate"> = {
  OFFICE: "orange",
  HOME: "green",
  TRANSIT: "amber",
  FIELD: "slate",
};
const HISTORY_DAYS = 7;

/** Today's date in IST as "YYYY-MM-DD", whatever time zone the admin's browser is in. */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function shiftKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === shiftKey(today, -1)) return "Yesterday";
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * Master-detail like the Field workers page: a roster of Hybrid and Work-from-home employees, and the selected
 * person's route for a chosen day — the last seven days are one tap away, older days through the calendar.
 */
export default function LocationHistoryPanel({ employees }: { employees: HistoryEmployee[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const selected = employees.find((e) => e.id === selectedId) ?? null;

  if (employees.length === 0) {
    return (
      <div className={CARD}>
        <EmptyState
          icon={MapPinned}
          title="No Hybrid or Work-from-home employees yet"
          text="Set an employee's work mode to Hybrid or Work from home, and their routes will show up here."
        />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q))
    : employees;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className={`${CARD} p-3`}>
          {employees.length > 6 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          )}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto lg:max-h-[calc(100vh-220px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
            {filtered.map((e) => {
              const active = e.id === selectedId;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors lg:w-full ${
                    active ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={e.name} size={34} />
                  <span className="min-w-0 leading-tight">
                    <span className={`block truncate text-sm ${active ? "font-semibold text-orange-700" : "font-medium text-slate-800"}`}>
                      {e.name}
                    </span>
                    <span className="block text-[11.5px] text-slate-500">
                      {e.employeeCode} · {e.workMode === "HYBRID" ? "Hybrid" : "WFH"}
                    </span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">No match.</p>}
          </div>
        </div>
      </aside>

      <section className="min-w-0">
        {selected ? (
          <EmployeeRoute key={selected.id} employee={selected} />
        ) : (
          <div className={CARD}>
            <EmptyState icon={MapPinned} title="Select an employee" text="Pick someone to see where they were." />
          </div>
        )}
      </section>
    </div>
  );
}

function EmployeeRoute({ employee }: { employee: HistoryEmployee }) {
  const today = istToday();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Fetches the chosen day. The loading/error state is reset where the day is picked (see `pick`), not here,
  // so this effect only sets state after the request comes back — and a slow answer for a day the admin has
  // already moved away from is ignored.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/employees/${employee.id}/visited-places?date=${date}&view=route`, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load.");
        if (!cancelled) setData(body as DayResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, employee.id]);

  function pick(next: string) {
    if (next === date) return;
    setLoading(true);
    setError(null);
    setDate(next);
  }

  const days = Array.from({ length: HISTORY_DAYS + 1 }, (_, i) => shiftKey(today, -i));
  const isRecent = days.includes(date);

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex flex-col gap-3 p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={employee.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {employee.name} <span className="font-normal text-slate-500">· {employee.employeeCode}</span>
            </p>
            <p className="text-xs text-slate-500">{employee.workMode === "HYBRID" ? "Hybrid (office + home)" : "Work from home"}</p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-orange-300"
            >
              <CalendarDays className="h-4 w-4 text-slate-500" />
              {isRecent ? "Older dates" : dayLabel(date, today)}
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${calendarOpen ? "rotate-180" : ""}`} />
            </button>
            {calendarOpen && (
              <div role="dialog" aria-label="Pick a date" className={`${CARD} absolute right-0 top-full z-40 mt-2 w-[310px] p-4 shadow-xl`}>
                <VisitDatePicker
                  userId={employee.id}
                  selectedDate={date}
                  anyData
                  onSelect={(d) => {
                    setCalendarOpen(false);
                    pick(d);
                  }}
                />
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  Location data recorded
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The last seven days, one tap each */}
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {days.map((d) => {
            const active = d === date;
            return (
              <button
                key={d}
                type="button"
                onClick={() => pick(d)}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-black/10 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700"
                }`}
              >
                {dayLabel(d, today)}
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {loading && !data ? (
        <div className={`${CARD} p-10 text-center text-sm text-slate-500`}>Loading…</div>
      ) : data ? (
        <div className={loading ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Checked in" value={data.checkInAt ? timeLabel(data.checkInAt) : "—"} />
              <Stat label="Checked out" value={data.checkOutAt ? timeLabel(data.checkOutAt) : data.checkInAt ? "Still in" : "—"} />
              <Stat label="Location points" value={String(data.pingCount)} />
              <Stat
                label="Tracking coverage"
                value={data.trackingCoveragePct != null ? `${data.trackingCoveragePct}%` : "—"}
              />
            </div>

            {data.segments.length > 0 && (
              <div className={`${CARD} p-4`}>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Clock className="h-4 w-4 text-slate-500" /> Where the day was spent
                </p>
                <ol className="flex flex-col gap-1.5">
                  {data.segments.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
                      <Pill tone={MODE_TONE[s.mode] ?? "slate"}>{MODE_LABEL[s.mode] ?? s.mode}</Pill>
                      <span className="tabular-nums">
                        {timeLabel(s.startedAt)} – {s.endedAt ? timeLabel(s.endedAt) : "now"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {data.gaps.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      Location tracking was interrupted {data.gaps.length} {data.gaps.length === 1 ? "time" : "times"}
                    </p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[13px] font-medium text-amber-900">Show the gaps</summary>
                      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                        {data.gaps.map((g, i) => (
                          <li key={i} className="tabular-nums">
                            {timeLabel(g.from)} – {timeLabel(g.to)} · {minutesLabel(g.minutes)} without data
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </div>
              </div>
            )}

            <div className={`${CARD} overflow-hidden p-1.5`}>
              {data.pings.length > 0 ? (
                <FullscreenMapFrame className="h-[380px] sm:h-[480px]">
                  <VisitedPlacesMap pings={data.pings} places={[]} start={data.start} end={data.end} />
                </FullscreenMapFrame>
              ) : (
                <EmptyState
                  icon={Route}
                  title="No route for this day"
                  text={
                    data.mostRecentDataDate
                      ? `No location points were recorded on ${dayLabel(date, today)}. The latest data is from ${dayLabel(data.mostRecentDataDate, today)}.`
                      : "No location points have been recorded for this employee yet."
                  }
                />
              )}
            </div>
            {employee.workMode === "HYBRID" && data.segments.some((s) => s.mode === "OFFICE") && (
              <p className="text-xs text-slate-500">
                Time spent in the Office is left out of the line on the map, so the route shows travel and home.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
