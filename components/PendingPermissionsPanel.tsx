"use client";

import { useState } from "react";
import { Clock, Hourglass } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY } from "./admin/ui";

export interface PendingPermission {
  id: string;
  startTime: string;
  endTime: string;
  employee: { id: string; employeeCode: string; name: string };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Review queue for self-declared timed-permission requests — see
 * /api/admin/timed-permissions. A request does nothing on the employee's
 * side until decided here (see evaluateTimedPermission in
 * /api/kiosk/location), so this is deliberately surfaced on the dashboard
 * landing page rather than buried in a per-employee view. */
export default function PendingPermissionsPanel({
  initialPermissions,
}: {
  initialPermissions: PendingPermission[];
}) {
  const [permissions, setPermissions] = useState(initialPermissions);
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
      setPermissions((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  if (permissions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(217,119,6,0.35)]">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-600">
            <Hourglass className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-slate-900">Permission requests awaiting review</p>
            <p className="text-[12px] text-slate-500">Employees are waiting on your decision.</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">
          {permissions.length}
        </span>
      </div>
      {error ? <p className="px-5 pb-2 text-xs text-red-600">{error}</p> : null}
      <div className="flex flex-col divide-y divide-amber-100 border-t border-amber-100 bg-white/70">
        {permissions.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={p.employee.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {p.employee.name} <span className="font-normal text-slate-500">· {p.employee.employeeCode}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-slate-500">
                <Clock className="h-3 w-3" />
                {formatTime(p.startTime)} – {formatTime(p.endTime)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => decide(p.id, "REJECTED")}
              disabled={actingOn === p.id}
              className={`${BTN_SECONDARY} shrink-0 !px-3.5 !py-1.5 !text-xs text-red-600 hover:!bg-red-50`}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => decide(p.id, "APPROVED")}
              disabled={actingOn === p.id}
              className={`${BTN_PRIMARY} shrink-0 !px-3.5 !py-1.5 !text-xs`}
            >
              Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
