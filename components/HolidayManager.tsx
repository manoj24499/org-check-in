"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** The public-holiday calendar — excluded from every leave request's day
 * count (see lib/timeOff.ts's countLeaveDays), so this is the one place that
 * needs editing when the holiday list changes. */
export default function HolidayManager({ holidays: initialHolidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const [holidays, setHolidays] = useState(initialHolidays);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    setDate("");
    setName("");
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
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Public holidays — {new Date().getFullYear()}</p>
        <p className="text-xs text-secondary mt-1">
          These days are excluded from every leave request&apos;s day count and shown as holidays, not gaps, in
          attendance calendars.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-6 py-4 border-b border-border-soft bg-surface">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <span className="text-xs text-muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Independence Day"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {loading ? "Adding…" : "Add"}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">{error}</div>
      )}

      <div className="divide-y divide-border-soft">
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center gap-3 px-6 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{h.name}</p>
              <p className="text-xs text-muted mt-0.5">{formatDate(h.date)}</p>
            </div>
            <button
              onClick={() => handleDelete(h)}
              disabled={deletingId === h.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 disabled:opacity-50 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deletingId === h.id ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}
        {holidays.length === 0 && (
          <p className="px-6 py-10 text-center text-secondary text-sm">No holidays added for this year yet.</p>
        )}
      </div>
    </div>
  );
}
