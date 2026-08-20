"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Compact single-month date picker for browsing a field worker's travel
 * history — replaces the old prev/next-day arrows in VisitedPlacesPanel.
 * Clicking any past date jumps the map straight to that day; month nav
 * (its own arrows) is unrelated to the day-stepping UI that was removed.
 */
export default function VisitDatePicker({
  selectedDate,
  onSelect,
}: {
  /** "YYYY-MM-DD" */
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const selected = new Date(`${selectedDate}T00:00:00`);
  const [viewDate, setViewDate] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  // Follow the selected date to whatever month it lands in — e.g. the
  // initial "jump to most recent data" load, which can land outside the
  // month the calendar opened on. Plain month browsing (no selection
  // change) is left alone.
  useEffect(() => {
    setViewDate(new Date(selected.getFullYear(), selected.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthStartWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: (number | null)[] = [
    ...Array(monthStartWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => changeMonth(-1)}
          className="p-1.5 rounded-lg hover:bg-surface-2 transition"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4 text-muted" />
        </button>
        <span className="text-sm font-medium text-foreground">
          {viewDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </span>
        <button
          onClick={() => changeMonth(1)}
          className="p-1.5 rounded-lg hover:bg-surface-2 transition"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4 text-muted" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-secondary uppercase tracking-wide mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>

      {/* Fixed cell height (not aspect-square) — the calendar sits in a
          half-width column next to the map, so its width varies with the
          viewport. Tying cell height to width there would make the whole
          grid taller than its allotted row on wide screens. */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;
          const cellDate = new Date(year, month, day);
          const key = dateKey(cellDate);
          const isSelected = key === selectedDate;
          const isToday = key === dateKey(today);
          const isFuture = cellDate > today;

          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              disabled={isFuture}
              className={`h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-primary text-white"
                  : isToday
                    ? "bg-primary/10 text-primary"
                    : "text-muted-2 hover:bg-surface-2"
              } ${isFuture ? "cursor-not-allowed opacity-30" : "cursor-pointer"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
