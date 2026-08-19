"use client";

import { useState } from "react";

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
 * request does nothing on the employee's side until decided here. */
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

  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/35 bg-surface-2 overflow-hidden shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Leave requests awaiting review</p>
        <span className="text-xs font-medium text-primary-dark tabular-nums">{requests.length}</span>
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600">{error}</p> : null}
      <div className="flex flex-col">
        {requests.map((r) => {
          const dateLabel =
            r.startDate === r.endDate ? formatDate(r.startDate) : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
          const isDeclining = decliningId === r.id;
          return (
            <div key={r.id} className="px-4 py-3 border-b border-border-soft last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.employee.name} <span className="text-muted">· {r.employee.employeeCode}</span>
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {TYPE_LABEL[r.type]} · {dateLabel} · {r.days} day{r.days === 1 ? "" : "s"}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </div>
                {!isDeclining && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDecliningId(r.id);
                        setDeclineNote("");
                      }}
                      disabled={actingOn === r.id}
                      className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.id, "APPROVED")}
                      disabled={actingOn === r.id}
                      className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>

              {isDeclining && (
                <div className="flex items-center gap-2 mt-2.5">
                  <input
                    type="text"
                    value={declineNote}
                    onChange={(e) => setDeclineNote(e.target.value)}
                    placeholder="Reason for declining (optional)"
                    className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setDecliningId(null)}
                    disabled={actingOn === r.id}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface transition disabled:opacity-50 shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r.id, "REJECTED", declineNote.trim() || undefined)}
                    disabled={actingOn === r.id}
                    className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50 shrink-0"
                  >
                    {actingOn === r.id ? "Declining…" : "Confirm decline"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
