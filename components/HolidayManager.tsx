"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Trash2, X } from "lucide-react";
import { BTN_PRIMARY, EmptyState, IconChip } from "./admin/ui";

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

/** The public-holiday calendar — excluded from every leave request's day
 * count (see lib/timeOff.ts's countLeaveDays), so this is the one place that
 * needs editing when the holiday list changes. The add-holiday form stays
 * tucked behind the header's "Add" button rather than always shown, so this
 * panel's list gets the same compact treatment as LeaveRequestsPanel next
 * to it. */
function monthOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}
function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
}

export default function HolidayManager({ holidays: initialHolidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const [holidays, setHolidays] = useState(initialHolidays);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openAdd() {
    setAdding(true);
    setError(null);
  }

  function closeAdd() {
    setAdding(false);
    setDate("");
    setName("");
    setError(null);
  }

  async function handleAdd() {
    if (!date || !name.trim()) {
      setError("Enter both a date and a name.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name: name.trim() }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setHolidays((prev) => [...prev, data.holiday].sort((a, b) => a.date.localeCompare(b.date)));
    closeAdd();
    router.refresh();
  }

  async function handleDelete(holiday: Holiday) {
    if (!confirm(`Remove "${holiday.name}" (${formatDate(holiday.date)})?`)) return;
    setDeletingId(holiday.id);
    await fetch(`/api/admin/holidays/${holiday.id}`, { method: "DELETE" });
    setHolidays((prev) => prev.filter((h) => h.id !== holiday.id));
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)] overflow-hidden flex flex-col lg:max-h-[calc(100vh-240px)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <IconChip icon={CalendarDays} tone="indigo" size="sm" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Public holidays</p>
            <p className="text-[12px] text-slate-500">{new Date().getFullYear()} · days off for everyone</p>
          </div>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-xs`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-border-soft bg-surface shrink-0">
          <div className="flex flex-wrap items-end gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-black/10 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Independence Day"
              className="flex-1 min-w-[140px] rounded-xl border border-black/10 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5 !text-xs`}
            >
              {loading ? "Adding…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              disabled={loading}
              className="rounded-xl border border-border text-muted hover:bg-surface p-1.5 transition disabled:opacity-50"
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {holidays.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No holidays yet" text="Add the public holidays your team gets off this year." />
        ) : (
          <div className="flex flex-col">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0">
                <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100">
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-wider">{monthOf(h.date)}</span>
                  <span className="mt-0.5 text-[17px] font-semibold leading-none tabular-nums">{dayOf(h.date)}</span>
                </span>
                <p className="flex-1 truncate text-sm font-medium text-slate-900">{h.name}</p>
                <button
                  onClick={() => handleDelete(h)}
                  disabled={deletingId === h.id}
                  className="text-muted hover:text-red-600 transition disabled:opacity-50 shrink-0 p-2 -m-1"
                  aria-label={`Remove ${h.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
