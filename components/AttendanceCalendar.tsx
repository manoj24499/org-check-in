"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, CalendarDays, X } from "lucide-react";
import { computeWorkedMs } from "@/lib/attendanceHours";

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto?: boolean;
  pauses?: { pausedAt: string; resumedAt: string | null }[];
};

type Event = AttendanceRecord & { date: Date };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hoursForDay(list: Event[] | undefined) {
  if (!list) return 0;
  let total = 0;
  let openIn: Event | null = null;
  for (const e of list) {
    if (e.type === "CHECK_IN") {
      openIn = e;
    } else if (e.type === "CHECK_OUT" && openIn) {
      const pauses = (openIn.pauses ?? []).map((p) => ({
        pausedAt: new Date(p.pausedAt),
        resumedAt: p.resumedAt ? new Date(p.resumedAt) : null,
      }));
      total += computeWorkedMs(openIn.date, e.date, pauses) / (1000 * 60 * 60);
      openIn = null;
    }
  }
  return total;
}

function dayStatus(list: Event[] | undefined) {
  if (!list || list.length === 0) return "none" as const;
  const hasIn = list.some((e) => e.type === "CHECK_IN");
  const hasOut = list.some((e) => e.type === "CHECK_OUT");
  return hasIn && hasOut ? ("complete" as const) : ("partial" as const);
}

export default function AttendanceCalendar({
  attendances,
  layout = "stacked",
}: {
  attendances: AttendanceRecord[];
  /** "split" puts the calendar grid on the left and the summary/day-detail on the right — better for a full-width card. Defaults to the original stacked layout. */
  layout?: "stacked" | "split";
}) {
  const events = useMemo<Event[]>(
    () =>
      attendances
        .map((a) => ({ ...a, date: new Date(a.timestamp) }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [attendances],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = dateKey(e.date);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const latest = events[events.length - 1]?.date ?? new Date();
  const [viewDate, setViewDate] = useState(
    () => new Date(latest.getFullYear(), latest.getMonth(), 1),
  );
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthStartWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayKey = dateKey(today);

  const monthSummary = (() => {
    let daysPresent = 0;
    let totalHours = 0;
    let incompleteDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const list = byDay.get(dateKey(new Date(year, month, d)));
      if (!list || list.length === 0) continue;
      daysPresent++;
      totalHours += hoursForDay(list);
      if (dayStatus(list) === "partial") incompleteDays++;
    }
    return { daysPresent, totalHours, incompleteDays };
  })();

  const cells: (number | null)[] = [
    ...Array(monthStartWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedList = selectedDay ? byDay.get(dateKey(new Date(year, month, selectedDay))) : undefined;

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
    setSelectedDay(null);
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(today.getDate());
  }

  const monthNav = (
    <div className="flex items-center justify-between">
      <button
        onClick={() => changeMonth(-1)}
        className="rounded-lg p-2 hover:bg-slate-100 text-slate-500 transition"
        aria-label="Previous month"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goToToday}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition"
      >
        <CalendarDays className="w-4 h-4 text-primary" />
        <span className="font-bold text-slate-800">
          {viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
      </button>
      <button
        onClick={() => changeMonth(1)}
        className="rounded-lg p-2 hover:bg-slate-100 text-slate-500 transition"
        aria-label="Next month"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  const monthSummaryEl = (
    <div className="grid grid-cols-3 gap-3 text-center">
      <div className="rounded-xl bg-primary/5 border border-primary/20 py-3">
        <p className="text-2xl font-black text-primary">{monthSummary.daysPresent}</p>
        <p className="text-[11px] font-bold text-primary uppercase tracking-wide mt-0.5">
          Days Present
        </p>
      </div>
      <div className="rounded-xl bg-slate-50 border border-slate-200 py-3">
        <p className="text-2xl font-black text-slate-800">{monthSummary.totalHours.toFixed(1)}</p>
        <p className="text-[11px] font-bold text-secondary uppercase tracking-wide mt-0.5">
          Total Hours
        </p>
      </div>
      <div className="rounded-xl bg-slate-50 border border-slate-200 py-3">
        <p className="text-2xl font-black text-slate-800">{monthSummary.incompleteDays}</p>
        <p className="text-[11px] font-bold text-secondary uppercase tracking-wide mt-0.5">
          Incomplete
        </p>
      </div>
    </div>
  );

  const weekdayHeader = (
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-secondary uppercase tracking-wide">
      {WEEKDAYS.map((w) => (
        <div key={w}>{w}</div>
      ))}
    </div>
  );

  const dayGrid = (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((day, i) => {
        if (day === null) return <div key={`blank-${i}`} />;
        const cellDate = new Date(year, month, day);
        const key = dateKey(cellDate);
        const list = byDay.get(key);
        const status = dayStatus(list);
        const isToday = key === todayKey;
        const isSelected = day === selectedDay;
        const isFuture = cellDate > today;

        return (
          <button
            key={key}
            onClick={() => setSelectedDay(isSelected ? null : day)}
            disabled={isFuture}
            className={`relative aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
              isSelected
                ? "bg-primary text-white shadow-md shadow-primary/30"
                : isToday
                  ? "bg-primary/10 text-primary"
                  : "text-slate-700 hover:bg-slate-100"
            } ${isFuture ? "cursor-not-allowed opacity-30" : "cursor-pointer"}`}
          >
            {day}
            {list && list.length > 0 && (
              <span
                className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                  isSelected ? "bg-white" : status === "complete" ? "bg-primary" : "bg-amber-500"
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );

  const dayDetail = (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 min-h-[92px]">
      {!selectedDay && (
        <p className="text-sm text-secondary text-center py-2">
          Select a date to see check-in / check-out times.
        </p>
      )}
      {selectedDay && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-bold text-slate-800">
              {new Date(year, month, selectedDay).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            {hoursForDay(selectedList) > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1">
                <Clock className="w-3.5 h-3.5" />
                {hoursForDay(selectedList).toFixed(2)} hrs
              </span>
            )}
          </div>

          {(!selectedList || selectedList.length === 0) && (
            <p className="text-sm text-secondary">No attendance recorded for this date.</p>
          )}

          <div className="flex flex-col gap-2">
            {(selectedList ?? []).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {e.hasPhoto && (
                    <button
                      onClick={() => setLightboxId(e.id)}
                      className="shrink-0"
                      aria-label="View check-in photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/attendance/${e.id}/photo`}
                        alt="Check-in photo"
                        className="w-9 h-9 rounded-md object-cover border border-slate-200 hover:opacity-80 transition-opacity"
                      />
                    </button>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm font-semibold truncate ${
                      e.type === "CHECK_IN" ? "text-primary" : "text-slate-500"
                    }`}
                  >
                    {e.type === "CHECK_IN" ? (
                      <LogIn className="w-4 h-4 shrink-0" />
                    ) : (
                      <LogOut className="w-4 h-4 shrink-0" />
                    )}
                    {e.type === "CHECK_IN" ? "Check In" : "Check Out"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm text-slate-600">
                    {e.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200">
                    {e.method}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {layout === "split" ? (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="lg:w-80 lg:shrink-0 flex flex-col gap-4">
            {monthNav}
            {weekdayHeader}
            {dayGrid}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-5">
            {monthSummaryEl}
            {dayDetail}
          </div>
        </div>
      ) : (
        <>
          {monthNav}
          {monthSummaryEl}
          {weekdayHeader}
          {dayGrid}
          {dayDetail}
        </>
      )}

      {lightboxId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setLightboxId(null)}
        >
          <div className="relative max-w-sm w-full">
            <button
              onClick={() => setLightboxId(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/attendance/${lightboxId}/photo`}
              alt="Check-in photo"
              className="w-full rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
