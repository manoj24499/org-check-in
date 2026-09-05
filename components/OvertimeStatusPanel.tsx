"use client";

import { useState } from "react";

export interface ActiveOvertimeRequest {
  id: string;
  estimatedEndAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  employee: { id: string; employeeCode: string; name: string };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<ActiveOvertimeRequest["status"], string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Declined",
};
const STATUS_TONE: Record<ActiveOvertimeRequest["status"], string> = {
  PENDING: "text-amber-600",
  APPROVED: "text-primary-dark",
  REJECTED: "text-red-600",
};

/** Live view of everyone currently working overtime — see
 * /api/mobile/me/overtime. Unlike PendingPermissionsPanel, a request here
 * already took effect the moment the employee made it; approving/declining
 * is purely a record for later (payroll/audit), so it never removes the row
 * on decision — only checking out does (this list only ever shows requests
 * with no CHECK_OUT recorded against them yet). */
export default function OvertimeStatusPanel({
  initialRequests,
}: {
  initialRequests: ActiveOvertimeRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
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

  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/35 bg-surface-2 overflow-hidden shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Currently working overtime</p>
        <span className="text-xs font-medium text-primary-dark tabular-nums">{requests.length}</span>
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600">{error}</p> : null}
      <div className="flex flex-col">
        {requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-border-soft last:border-b-0">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {r.employee.name} <span className="text-muted">· {r.employee.employeeCode}</span>
              </p>
              <p className="text-xs text-muted mt-0.5">
                <span className="tabular-nums">until ~{formatTime(r.estimatedEndAt)}</span> — {r.reason}
              </p>
            </div>
            {r.status === "PENDING" ? (
              <>
                <button
                  type="button"
                  onClick={() => decide(r.id, "REJECTED")}
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
            ) : (
              <span className={`text-xs font-semibold shrink-0 ${STATUS_TONE[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
