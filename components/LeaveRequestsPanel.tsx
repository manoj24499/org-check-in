"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

export interface PendingLeaveRequest {
  id: string;
  type: "CASUAL" | "SICK" | "EARNED";
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  employee: { id: string; employeeCode: string; name: string };
}

const TYPE_LABEL: Record<PendingLeaveRequest["type"], string> = {
  CASUAL: "Casual",
  SICK: "Sick",
  EARNED: "Earned",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

/** Review queue for leave requests — see /api/admin/leave-requests. A
 * request does nothing on the employee's side until decided here. Always
 * rendered (even with zero pending) so it holds its place in the Leave
 * page's two-column layout next to HolidayManager, instead of the section
 * disappearing and leaving a lopsided gap. */
export default function LeaveRequestsPanel({
  initialRequests,
}: {
  initialRequests: PendingLeaveRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED", note?: string) => {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong.");
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setDecliningId(null);
      setDeclineNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden flex flex-col lg:h-full lg:min-h-0">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Review leave requests</p>
        </div>
        {requests.length > 0 && (
          <span className="text-xs font-medium text-primary-dark bg-primary/10 rounded-full px-2.5 py-0.5 tabular-nums">
            {requests.length} pending
          </span>
        )}
      </div>

      {error ? <p className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p> : null}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {requests.length === 0 ? (
          <p className="px-4 py-10 text-center text-secondary text-sm">Nothing pending — you&apos;re all caught up.</p>
        ) : (
          <div className="flex flex-col">
            {requests.map((r) => {
              const dateLabel =
                r.startDate === r.endDate
                  ? formatDate(r.startDate)
                  : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
              const isDeclining = decliningId === r.id;
              return (
                <div key={r.id} className="px-4 py-2.5 border-b border-border-soft last:border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {r.employee.name} <span className="text-muted text-xs">{r.employee.employeeCode}</span>
                      </p>
                      <p className="text-xs text-secondary mt-0.5 truncate">
                        {TYPE_LABEL[r.type]} · {dateLabel} · {r.days} day{r.days === 1 ? "" : "s"}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </p>
                    </div>
                    {!isDeclining && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setDecliningId(r.id);
                            setDeclineNote("");
                          }}
                          disabled={actingOn === r.id}
                          className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          onClick={() => decide(r.id, "APPROVED")}
                          disabled={actingOn === r.id}
                          className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>

                  {isDeclining && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={declineNote}
                        onChange={(e) => setDeclineNote(e.target.value)}
                        placeholder="Reason for declining (optional)"
                        className="flex-1 min-w-0 basis-full sm:basis-auto rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setDecliningId(null)}
                        disabled={actingOn === r.id}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface transition disabled:opacity-50 shrink-0"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(r.id, "REJECTED", declineNote.trim() || undefined)}
                        disabled={actingOn === r.id}
                        className="rounded-lg bg-red-600 text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50 shrink-0"
                      >
                        {actingOn === r.id ? "Declining…" : "Confirm decline"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
