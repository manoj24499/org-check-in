"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface OnLeaveToday {
  requestId: string;
  type: "CASUAL" | "SICK" | "EARNED";
  /** Only a request this exact control created (single-day, startDate ===
   * endDate === today) can be cancelled from here — see the route's own
   * comment for why a normal multi-day submission is left alone. */
  isQuickMarked: boolean;
}

/**
 * Per-employee "Mark as leave" action on the dashboard's status table — a
 * quick admin override for "this employee is out today," distinct from the
 * employee-submitted-then-approved flow on the Leave page (see
 * /api/admin/employees/[id]/leave-today). Renders just the action itself;
 * the "On leave" badge is drawn by the caller's own leaveBadge, since
 * whether someone's on leave today needs to affect that badge regardless of
 * which flow put them there.
 */
export default function MarkLeaveControl({
  employeeId,
  onLeaveToday,
}: {
  employeeId: string;
  onLeaveToday: OnLeaveToday | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"CASUAL" | "SICK" | "EARNED">("CASUAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markLeave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/leave-today`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function unmarkLeave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/leave-today`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Something went wrong." }));
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (onLeaveToday) {
    if (!onLeaveToday.isQuickMarked) return null;
    return (
      <div className="flex flex-col gap-0.5">
        <button
          onClick={unmarkLeave}
          disabled={loading}
          className="text-[11px] text-muted hover:text-red-600 transition disabled:opacity-50 text-left"
        >
          {loading ? "Cancelling…" : "Cancel leave"}
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-muted hover:text-primary-dark transition"
      >
        Mark as leave
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 w-44 rounded-lg border border-border bg-surface-2 shadow-lg p-3 flex flex-col gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "CASUAL" | "SICK" | "EARNED")}
            className="rounded-lg border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          >
            <option value="CASUAL">Casual</option>
            <option value="SICK">Sick</option>
            <option value="EARNED">Earned</option>
          </select>
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border py-1 text-xs text-muted hover:bg-surface transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={markLeave}
              disabled={loading}
              className="flex-1 rounded-lg border border-primary text-primary-dark py-1 text-xs font-medium hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loading ? "…" : "Mark"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
