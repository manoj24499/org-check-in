"use client";

import { useState } from "react";

export interface OvertimeHistoryEntry {
  id: string;
  estimatedEndAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  workSummary: string | null;
  hasPhoto: boolean;
  createdAt: string;
  /** Omitted when this list is already scoped to one employee. */
  employee?: { employeeCode: string; name: string };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONE: Record<OvertimeHistoryEntry["status"], string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-primary/10 text-primary-dark border-primary/20",
  REJECTED: "bg-red-50 text-red-600 border-red-200",
};
const STATUS_LABEL: Record<OvertimeHistoryEntry["status"], string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Declined",
};

/** Completed overtime — the right half of /admin/overtime's split layout,
 * next to OvertimeStatusPanel's "currently working" panel on the left. Every
 * request here has already been checked out (see the schema comment on
 * OvertimeRequest.submittedAt), so this is the only place a request's work
 * summary/photo is ever visible — the live panel drops a request the moment
 * it lands here. A still-PENDING one (checked out before ever being
 * reviewed) can still be approved/declined from here, same as on the live
 * panel — that decision is record-keeping only and never changes anything
 * the employee already did. */
export default function OvertimeHistoryList({ requests: initial }: { requests: OvertimeHistoryEntry[] }) {
  const [requests, setRequests] = useState(initial);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/overtime-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong.");
      }
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: decision } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden flex flex-col lg:h-full lg:min-h-0">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between shrink-0">
        <p className="text-sm font-medium text-foreground">Completed overtime</p>
        {requests.length > 0 && (
          <span className="text-xs font-medium text-muted bg-surface rounded-full px-2.5 py-0.5 tabular-nums">
            {requests.length}
          </span>
        )}
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p> : null}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {requests.length === 0 ? (
          <p className="px-4 py-10 text-center text-secondary text-sm">No completed overtime yet.</p>
        ) : (
          <div className="flex flex-col">
            {requests.map((r) => (
              <div key={r.id} className="px-4 py-3 border-b border-border-soft last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {r.employee ? (
                      <p className="text-sm font-medium text-foreground">
                        {r.employee.name} <span className="text-muted font-normal">· {r.employee.employeeCode}</span>
                      </p>
                    ) : null}
                    <span className="text-sm font-medium text-foreground">{formatDateTime(r.createdAt)}</span>
                    <span className="text-xs text-muted ml-2 tabular-nums">
                      until ~{formatDateTime(r.estimatedEndAt)}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>

                <p className="text-sm text-secondary mt-2">{r.reason}</p>

                <div className="mt-3 rounded-md bg-surface border border-border-soft p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Work summary
                  </p>
                  {r.workSummary ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{r.workSummary}</p>
                  ) : (
                    <p className="text-sm text-muted italic">No summary given.</p>
                  )}
                  {r.hasPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/overtime-requests/${r.id}/photo`}
                      alt="Overtime work photo"
                      className="mt-2 max-w-xs rounded-md border border-border-soft"
                    />
                  ) : null}
                </div>

                {r.status === "PENDING" ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => decide(r.id, "REJECTED")}
                      disabled={actingOn === r.id}
                      className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.id, "APPROVED")}
                      disabled={actingOn === r.id}
                      className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
