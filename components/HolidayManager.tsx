"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, Trash2, X } from "lucide-react";

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
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden flex flex-col lg:h-full lg:min-h-0">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Public holidays · {new Date().getFullYear()}</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 text-xs font-semibold text-primary-dark hover:bg-primary/5 transition"
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
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Independence Day"
              className="flex-1 min-w-[140px] rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={loading}
              className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
            >
              {loading ? "Adding…" : "Save"}
            </button>
            <button
              type="button"
              onClick={closeAdd}
              disabled={loading}
              className="rounded-lg border border-border text-muted hover:bg-surface p-1.5 transition disabled:opacity-50"
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
          <p className="px-4 py-10 text-center text-secondary text-sm">No holidays added for this year yet.</p>
        ) : (
          <div className="flex flex-col">
            {holidays.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-2 border-b border-border-soft last:border-b-0">
                <span className="text-xs text-secondary w-12 shrink-0 tabular-nums">{formatDate(h.date)}</span>
                <p className="text-sm font-medium text-foreground flex-1 truncate">{h.name}</p>
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
