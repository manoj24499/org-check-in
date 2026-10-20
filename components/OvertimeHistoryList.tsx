"use client";

import { useSyncedState } from "./useSyncedState";
import { refreshAdminCounts } from "./adminCountsEvent";
import { useState } from "react";
import { History, Timer } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, IconChip, Pill, type Tone } from "./admin/ui";

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

const STATUS_TONE: Record<OvertimeHistoryEntry["status"], Tone> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
};

/** Display-only duration chip text, from data already on the entry. */
function durationLabel(startIso: string, endIso: string) {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
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
  const [requests, setRequests] = useSyncedState(initial);
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
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div className={`${CARD} overflow-hidden flex flex-col lg:max-h-[calc(100vh-240px)]`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <IconChip icon={History} tone="slate" size="sm" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Completed overtime</p>
            <p className="text-[12px] text-slate-500">Work summaries and photos from finished sessions.</p>
          </div>
        </div>
        {requests.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
            {requests.length}
          </span>
        )}
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p> : null}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {requests.length === 0 ? (
          <EmptyState icon={History} title="No completed overtime yet" text="Finished sessions will be listed here." />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {requests.map((r) => (
              <div key={r.id} className={`${CARD} lift px-4 py-4 transition-all duration-200`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    {r.employee ? <Avatar name={r.employee.name} size={36} /> : null}
                    <div className="min-w-0">
                      {r.employee ? (
                        <p className="truncate text-sm font-medium text-slate-900">
                          {r.employee.name} <span className="font-normal text-slate-500">· {r.employee.employeeCode}</span>
                        </p>
                      ) : null}
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{formatDateTime(r.createdAt)}</span>
                        <span className="tabular-nums">until ~{formatDateTime(r.estimatedEndAt)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {durationLabel(r.createdAt, r.estimatedEndAt) ? (
                      <Pill tone="indigo">
                        <Timer className="h-3 w-3" />
                        {durationLabel(r.createdAt, r.estimatedEndAt)}
                      </Pill>
                    ) : null}
                    <Pill tone={STATUS_TONE[r.status]} dot>
                      {STATUS_LABEL[r.status]}
                    </Pill>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">{r.reason}</p>

                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Work summary
                  </p>
                  {r.workSummary ? (
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{r.workSummary}</p>
                  ) : (
                    <p className="text-sm italic text-slate-500">No summary given.</p>
                  )}
                  {r.hasPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/admin/overtime-requests/${r.id}/photo`}
                      alt="Overtime work photo"
                      className="mt-2 max-w-xs rounded-xl border border-slate-200 shadow-sm"
                    />
                  ) : null}
                </div>

                {r.status === "PENDING" ? (
                  <div className="flex gap-2 mt-3">
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
