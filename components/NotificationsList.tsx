"use client";

import { useSyncedState } from "./useSyncedState";
import { useState } from "react";
import Link from "next/link";
import { Bell, Hourglass, Loader2, MapPin, MapPinOff, ScanEye, ShieldAlert, Trash2, TriangleAlert } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, Pill, type Tone } from "./admin/ui";
import { refreshAdminCounts } from "./adminCountsEvent";
import type { AdminNotification, NotificationKind } from "@/lib/adminNotifications";

const KIND: Record<NotificationKind, { icon: typeof Bell; chip: string; tone: Tone; label: string }> = {
  PERMISSION_REQUEST: { icon: Hourglass, chip: "bg-amber-500/15 text-amber-600", tone: "amber", label: "Needs your decision" },
  OUTSIDE_AREA: { icon: MapPin, chip: "bg-amber-500/15 text-amber-600", tone: "amber", label: "Outside area" },
  TRACKING_STOPPED: { icon: MapPinOff, chip: "bg-red-500/10 text-red-600", tone: "red", label: "Tracking" },
  FACE_SERVICE: { icon: ShieldAlert, chip: "bg-amber-500/10 text-amber-600", tone: "amber", label: "Face service" },
  FACE_MISSED: { icon: ScanEye, chip: "bg-amber-500/10 text-amber-600", tone: "amber", label: "Face check" },
};

const when = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });

/**
 * The admin's notification inbox: every alert the dashboard shows, in one list, each with a delete
 * button. Deleting hides that alert (for all admins) on this page and on the dashboard. Permission
 * requests have Approve and Decline instead, since deleting a request nobody answered would just hide it.
 */
export default function NotificationsList({ initial }: { initial: AdminNotification[] }) {
  const [items, setItems] = useSyncedState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dismissible = items.filter((n) => n.dismissible);

  async function deleteOne(key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not delete it.");
      setItems((prev) => prev.filter((n) => n.key !== key));
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete it.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAll() {
    if (!window.confirm(`Delete all ${dismissible.length} notifications? Requests that need a decision stay.`)) return;
    setBusy("all");
    setError(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: dismissible.map((n) => n.key) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not delete them.");
      const deleted = new Set(dismissible.map((n) => n.key));
      setItems((prev) => prev.filter((n) => !deleted.has(n.key)));
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete them.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(n: AdminNotification, decision: "APPROVED" | "REJECTED") {
    if (!n.permission) return;
    setBusy(n.key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/timed-permissions/${n.permission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Something went wrong.");
      setItems((prev) => prev.filter((x) => x.key !== n.key));
      refreshAdminCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className={CARD}>
        <EmptyState icon={Bell} title="You're all caught up" text="New alerts such as stopped tracking and missed face checks will show up here." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} {items.length === 1 ? "notification" : "notifications"}
        </p>
        {dismissible.length > 1 && (
          <button type="button" className={BTN_SECONDARY} onClick={deleteAll} disabled={busy !== null}>
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete all
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <ul className={`${CARD} divide-y divide-black/[0.06] overflow-hidden`}>
        {items.map((n) => {
          const k = KIND[n.kind];
          const Icon = k.icon;
          return (
            <li key={n.key} className="flex flex-wrap items-start gap-3 px-5 py-4" data-notification={n.kind} data-key={n.key}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${k.chip}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14.5px] font-semibold text-slate-900">{n.title}</p>
                  <Pill tone={k.tone}>{k.label}</Pill>
                </div>
                {n.employee && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Avatar name={n.employee.name} size={22} />
                    <Link href={`/admin/employees/${n.employee.id}`} className="text-[13px] font-medium text-slate-800 hover:text-orange-600">
                      {n.employee.name}
                    </Link>
                    <span className="text-xs text-slate-500">{n.employee.employeeCode}</span>
                  </div>
                )}
                <p className="mt-1.5 max-w-3xl text-[13px] text-slate-600">{n.message}</p>
                {n.permission && (
                  <p className="mt-1 text-[13px] font-medium text-slate-800">
                    Requested pause: {timeOnly.format(new Date(n.permission.startTime))} to {timeOnly.format(new Date(n.permission.endTime))}
                  </p>
                )}
                <p className="mt-1.5 text-xs tabular-nums text-slate-500">{when.format(new Date(n.occurredAt))}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n.permission ? (
                  <>
                    <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => decide(n, "APPROVED")}>
                      Approve
                    </button>
                    <button type="button" className={BTN_SECONDARY} disabled={busy !== null} onClick={() => decide(n, "REJECTED")}>
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteOne(n.key)}
                    disabled={busy !== null}
                    aria-label={`Delete notification: ${n.title}`}
                    title="Delete"
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {busy === n.key ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Trash2 className="h-[18px] w-[18px]" />}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
