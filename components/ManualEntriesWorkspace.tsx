"use client";

import { useState } from "react";
import { Clock, History, Hourglass } from "lucide-react";
import { useSyncedState } from "./useSyncedState";
import { refreshAdminCounts } from "./adminCountsEvent";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, IconChip, Pill, type Tone } from "./admin/ui";

export type ManualEntryStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ManualEntryRow {
  id: string;
  /** IST day key, "YYYY-MM-DD". */
  date: string;
  checkInAt: string;
  checkOutAt: string;
  reason: string;
  status: ManualEntryStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  employee: { id: string; employeeCode: string; name: string };
}

const STATUS_TONE: Record<ManualEntryStatus, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red" };
const STATUS_LABEL: Record<ManualEntryStatus, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Declined" };

// Rendered in the viewer's timezone (differs from the server's during SSR) —
// hence suppressHydrationWarning on the time text below.
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const formatDate = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Admin queue for employees' manual-entry requests, plus the decided history. */
export default function ManualEntriesWorkspace({ requests: initial }: { requests: ManualEntryRow[] }) {
  const [rows, setRows] = useSyncedState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (id: string, decision: "APPROVED" | "REJECTED") => {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/manual-entry-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[id] || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong.");
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status: decision, reviewedAt: data?.reviewedAt ?? null, reviewedByName: data?.reviewedByName ?? null, reviewNote: data?.reviewNote ?? null }
            : r,
        ),
      );
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  const pending = rows.filter((r) => r.status === "PENDING");
  const decided = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <IconChip icon={Hourglass} tone="amber" size="sm" />
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Awaiting review</p>
              <p className="text-[12px] text-slate-500">Approving adds the check-in and check-out to attendance.</p>
            </div>
          </div>
          {pending.length > 0 && (
            <Pill tone="amber" dot pulse>
              {pending.length}
            </Pill>
          )}
        </div>
        {error ? <p className="px-5 py-2 text-xs text-red-600">{error}</p> : null}
        {pending.length === 0 ? (
          <EmptyState icon={Hourglass} title="No pending requests" text="Employee manual-entry requests appear here." />
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {pending.map((r) => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={r.employee.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {r.employee.name} <span className="font-normal text-slate-500">· {r.employee.employeeCode}</span>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500" suppressHydrationWarning>
                      <span className="font-medium text-slate-700">{formatDate(r.date)}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Clock className="h-3 w-3" />
                        {formatTime(r.checkInAt)} – {formatTime(r.checkOutAt)}
                      </span>
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{r.reason}</p>
                <input
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  maxLength={500}
                  placeholder="Optional note to the employee"
                  className="mt-2.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-400"
                />
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r.id, "REJECTED")}
                    disabled={actingOn === r.id}
                    className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-xs !text-red-600 hover:!bg-red-50`}
                  >
                    Decline
                  </button>
                  <button type="button" onClick={() => decide(r.id, "APPROVED")} disabled={actingOn === r.id} className={`${BTN_PRIMARY} !px-3 !py-1.5 !text-xs`}>
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${CARD} flex flex-col overflow-hidden lg:max-h-[calc(100vh-240px)]`}>
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <IconChip icon={History} tone="slate" size="sm" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Decided requests</p>
            <p className="text-[12px] text-slate-500">Who approved or declined, and when.</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {decided.length === 0 ? (
            <EmptyState icon={History} title="Nothing decided yet" text="Approved and declined requests will be listed here." />
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {decided.map((r) => (
                <div key={r.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.employee.name} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {r.employee.name} <span className="font-normal text-slate-500">· {r.employee.employeeCode}</span>
                        </p>
                        <p className="text-xs tabular-nums text-slate-500" suppressHydrationWarning>
                          {formatDate(r.date)} · {formatTime(r.checkInAt)} – {formatTime(r.checkOutAt)}
                        </p>
                      </div>
                    </div>
                    <Pill tone={STATUS_TONE[r.status]} dot>
                      {STATUS_LABEL[r.status]}
                    </Pill>
                  </div>
                  <p className="mt-1.5 pl-11 text-xs text-slate-600">Reason: {r.reason}</p>
                  <p className="mt-0.5 pl-11 text-xs text-slate-500" suppressHydrationWarning>
                    {r.status === "APPROVED" ? "Approved" : "Declined"} by {r.reviewedByName ?? "an admin"}
                    {r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}, ${formatTime(r.reviewedAt)}` : ""}
                    {r.reviewNote ? ` — ${r.reviewNote}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
