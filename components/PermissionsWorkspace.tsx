"use client";

import { useMemo, useState } from "react";
import { Clock, History, Search, UserRoundCheck } from "lucide-react";
import { useSyncedState } from "./useSyncedState";
import { refreshAdminCounts } from "./adminCountsEvent";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, IconChip, Pill, type Tone } from "./admin/ui";

export type PermissionStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface PermissionEntry {
  id: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  approvalStatus: PermissionStatus;
  reviewedAt: string | null;
  reviewedByName: string | null;
  /** Date of the check-in this permission belongs to. */
  attendanceDate: string;
  employee: { id: string; employeeCode: string; name: string };
}

const STATUS_TONE: Record<PermissionStatus, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red" };
const STATUS_LABEL: Record<PermissionStatus, string> = {
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Declined",
};

type Filter = "ALL" | PermissionStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Declined" },
];

// Times are formatted in the viewer's own timezone, which differs from the
// server's during SSR — hence suppressHydrationWarning on every rendered time
// below, so React doesn't report a text mismatch (error #418).
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function durationLabel(startIso: string, endIso: string) {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/**
 * The admin Permissions page body: who is on permission *right now* (left) and
 * the full history of timed-permission requests, newest first, filterable by
 * status and employee (right). Pending requests can be approved/declined from
 * the history list — same endpoint as the dashboard's review panel.
 */
export default function PermissionsWorkspace({
  onNow,
  history: initialHistory,
}: {
  onNow: PermissionEntry[];
  history: PermissionEntry[];
}) {
  const [history, setHistory] = useSyncedState(initialHistory);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/timed-permissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong.");
      }
      const data = await res.json().catch(() => null);
      setHistory((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                approvalStatus: decision,
                reviewedAt: data?.reviewedAt ?? new Date().toISOString(),
                reviewedByName: data?.reviewedByName ?? p.reviewedByName,
              }
            : p,
        ),
      );
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history.filter(
      (p) =>
        (filter === "ALL" || p.approvalStatus === filter) &&
        (!q || p.employee.name.toLowerCase().includes(q) || p.employee.employeeCode.toLowerCase().includes(q)),
    );
  }, [history, filter, query]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:items-start">
      {/* Now */}
      <div className={`${CARD} overflow-hidden lg:col-span-2`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <IconChip icon={UserRoundCheck} tone="green" size="sm" />
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">On permission now</p>
              <p className="text-[12px] text-slate-500">Approved, and inside their time window.</p>
            </div>
          </div>
          {onNow.length > 0 && (
            <Pill tone="green" dot pulse>
              {onNow.length}
            </Pill>
          )}
        </div>
        {onNow.length === 0 ? (
          <EmptyState icon={UserRoundCheck} title="Nobody is on permission" text="Employees on approved permission right now appear here." />
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {onNow.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={p.employee.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {p.employee.name} <span className="font-normal text-slate-500">· {p.employee.employeeCode}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-slate-500">
                    <Clock className="h-3 w-3" />
                    <span suppressHydrationWarning>
                      {formatTime(p.startTime)} – {formatTime(p.endTime)}
                    </span>
                  </p>
                </div>
                {durationLabel(p.startTime, p.endTime) ? <Pill tone="indigo">{durationLabel(p.startTime, p.endTime)}</Pill> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className={`${CARD} flex flex-col overflow-hidden lg:col-span-3 lg:max-h-[calc(100vh-240px)]`}>
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <IconChip icon={History} tone="slate" size="sm" />
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Permission history</p>
                <p className="text-[12px] text-slate-500">Every request, newest first.</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
              {visible.length}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee"
                className="w-full rounded-full border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-orange-400"
              />
            </label>
          </div>
        </div>
        {error ? <p className="shrink-0 px-5 py-2 text-xs text-red-600">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <EmptyState icon={History} title="No permissions found" text="Try a different filter or search." />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {visible.map((p) => (
                <div key={p.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={p.employee.name} size={36} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {p.employee.name} <span className="font-normal text-slate-500">· {p.employee.employeeCode}</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500" suppressHydrationWarning>
                          <span className="font-medium text-slate-700">{formatDay(p.startTime)}</span>
                          <span className="tabular-nums">
                            {formatTime(p.startTime)} – {formatTime(p.endTime)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {durationLabel(p.startTime, p.endTime) ? <Pill tone="indigo">{durationLabel(p.startTime, p.endTime)}</Pill> : null}
                      <Pill tone={STATUS_TONE[p.approvalStatus]} dot>
                        {STATUS_LABEL[p.approvalStatus]}
                      </Pill>
                    </div>
                  </div>
                  {p.approvalStatus !== "PENDING" && p.reviewedByName ? (
                    <p className="mt-1.5 pl-[48px] text-xs text-slate-500" suppressHydrationWarning>
                      {p.approvalStatus === "APPROVED" ? "Approved" : "Declined"} by {p.reviewedByName}
                      {p.reviewedAt ? ` · ${formatDay(p.reviewedAt)}, ${formatTime(p.reviewedAt)}` : ""}
                    </p>
                  ) : null}
                  {p.approvalStatus === "PENDING" ? (
                    <div className="mt-2.5 flex gap-2 pl-[48px]">
                      <button
                        type="button"
                        onClick={() => decide(p.id, "REJECTED")}
                        disabled={actingOn === p.id}
                        className={`${BTN_SECONDARY} shrink-0 !px-3 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50`}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(p.id, "APPROVED")}
                        disabled={actingOn === p.id}
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
    </div>
  );
}
