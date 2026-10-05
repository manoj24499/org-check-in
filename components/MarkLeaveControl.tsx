"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";

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
          className="text-[12px] font-medium text-slate-500 transition hover:text-red-600 disabled:opacity-50 text-left"
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
        className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 transition hover:text-orange-600"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Mark as leave
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 flex w-48 flex-col gap-2 rounded-xl border border-black/10 bg-white p-3 shadow-[0_16px_40px_-12px_rgba(16,24,40,0.25)]">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "CASUAL" | "SICK" | "EARNED")}
            className="rounded-lg border border-black/10 bg-slate-50 px-2 py-1.5 text-xs focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
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
              className="flex-1 rounded-lg border border-black/10 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={markLeave}
              disabled={loading}
              className="flex-1 rounded-lg bg-orange-600 py-1 text-xs font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? "…" : "Mark"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
