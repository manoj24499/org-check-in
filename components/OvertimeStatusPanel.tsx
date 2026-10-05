"use client";

import { useState } from "react";
import { BTN_PRIMARY, BTN_SECONDARY } from "./admin/ui";
import { Timer } from "lucide-react";
import { Avatar, EmptyState, IconChip, Pill } from "./admin/ui";

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

/** Compact live view of everyone currently working overtime, org-wide — the
 * left half of /admin/overtime's split layout, next to OvertimeHistoryList's
 * completed-requests panel on the right (see /api/mobile/me/overtime for how
 * a request comes to exist). Unlike PendingPermissionsPanel, a request here
 * already took effect the moment the employee made it; approving/declining
 * is purely a record for later (payroll/audit), so it never removes the row
 * on decision — only checking out does (this list only ever shows requests
 * with no CHECK_OUT recorded against them yet, which is also the moment it
 * moves over to the completed panel). Always rendered, even with zero
 * requests — same reasoning as LeaveRequestsPanel: holds its place in the
 * two-column layout instead of leaving a lopsided gap. */
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

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)] overflow-hidden flex flex-col lg:max-h-[calc(100vh-240px)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <IconChip icon={Timer} tone="orange" size="sm" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Currently working overtime</p>
            <p className="text-[12px] text-slate-500">People who are still on the clock past their shift.</p>
          </div>
        </div>
        {requests.length > 0 && (
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
            {requests.length}
          </span>
        )}
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p> : null}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {requests.length === 0 ? (
          <EmptyState icon={Timer} title="No overtime right now" text="Overtime requests will show up here as they come in." />
        ) : (
          <div className="flex flex-col">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0">
                <Avatar name={r.employee.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {r.employee.name} <span className="font-normal text-slate-500">· {r.employee.employeeCode}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <Pill tone="amber">until ~{formatTime(r.estimatedEndAt)}</Pill>
                    <span className="truncate">{r.reason}</span>
                  </p>
                </div>
                {r.status === "PENDING" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => decide(r.id, "REJECTED")}
                      disabled={actingOn === r.id}
                      className={`${BTN_SECONDARY} shrink-0 !px-3 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50`}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(r.id, "APPROVED")}
                      disabled={actingOn === r.id}
                      className={`${BTN_PRIMARY} shrink-0 !px-3 !py-1.5 !text-xs`}
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
        )}
      </div>
    </div>
  );
}
