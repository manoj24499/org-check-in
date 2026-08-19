"use client";

import { useState } from "react";

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
    <div className="rounded-lg border border-primary/35 bg-surface-2 overflow-hidden shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Permission requests awaiting review</p>
        <span className="text-xs font-medium text-primary-dark tabular-nums">{permissions.length}</span>
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-600">{error}</p> : null}
      <div className="flex flex-col">
        {permissions.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-border-soft last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {p.employee.name} <span className="text-muted">· {p.employee.employeeCode}</span>
              </p>
              <p className="text-xs text-muted mt-0.5 tabular-nums">
                {formatTime(p.startTime)} – {formatTime(p.endTime)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => decide(p.id, "REJECTED")}
              disabled={actingOn === p.id}
              className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => decide(p.id, "APPROVED")}
              disabled={actingOn === p.id}
              className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
            >
              Approve
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
