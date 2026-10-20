"use client";

import { useSyncedState } from "./useSyncedState";
import { refreshAdminCounts } from "./adminCountsEvent";
import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, IconChip, Pill } from "./admin/ui";

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

const TYPE_TONE: Record<PendingLeaveRequest["type"], "orange" | "red" | "indigo"> = {
  CASUAL: "orange",
  SICK: "red",
  EARNED: "indigo",
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
  const [requests, setRequests] = useSyncedState(initialRequests);
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
      refreshAdminCounts();
      setDecliningId(null);
      setDeclineNote("");
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
          <IconChip icon={Clock} tone="orange" size="sm" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Review leave requests</p>
            <p className="text-[12px] text-slate-500">Approve or decline what your team has asked for.</p>
          </div>
        </div>
        {requests.length > 0 && (
          <Pill tone="orange" dot pulse>
            {requests.length} pending
          </Pill>
        )}
      </div>

      {error ? <p className="px-4 py-2 text-xs text-red-600 shrink-0">{error}</p> : null}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {requests.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All caught up" text="No leave requests are waiting for you." />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {requests.map((r) => {
              const dateLabel =
                r.startDate === r.endDate
                  ? formatDate(r.startDate)
                  : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`;
              const isDeclining = decliningId === r.id;
              return (
                <div key={r.id} className={`${CARD} lift border-l-4 border-l-orange-400 px-4 py-4 transition-all duration-200`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.employee.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {r.employee.name} <span className="text-xs font-normal text-slate-500">{r.employee.employeeCode}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <Pill tone={TYPE_TONE[r.type]}>{TYPE_LABEL[r.type]}</Pill>
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                          {dateLabel}
                        </span>
                        <span>· {r.days} day{r.days === 1 ? "" : "s"}</span>
                      </p>
                      {r.reason ? <p className="mt-2 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs italic text-slate-600">&ldquo;{r.reason}&rdquo;</p> : null}
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
                    )}
                  </div>

                  {isDeclining && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={declineNote}
                        onChange={(e) => setDeclineNote(e.target.value)}
                        placeholder="Reason for declining (optional)"
                        className="flex-1 min-w-0 basis-full sm:basis-auto rounded-xl border border-black/10 bg-white px-3 py-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all duration-200"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setDecliningId(null)}
                        disabled={actingOn === r.id}
                        className={`${BTN_SECONDARY} shrink-0 !px-3 !py-1.5 !text-xs`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(r.id, "REJECTED", declineNote.trim() || undefined)}
                        disabled={actingOn === r.id}
                        className={`${BTN_PRIMARY} shrink-0 !bg-red-600 !px-3 !py-1.5 !text-xs hover:!bg-red-700`}
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
