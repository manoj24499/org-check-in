"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle } from "lucide-react";
import MultiEmployeePicker, { type PickableEmployee } from "./MultiEmployeePicker";

// Same Date.getDay() convention used throughout (0 = Sunday ... 6 = Saturday).
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export type ConflictLookup = (userId: string, weekday: number) => { shiftId: string; label: string } | null;

/**
 * Puts many employees on one shift for chosen weekdays in a single save —
 * the fast path for setting up a whole team, as opposed to the employee
 * detail page's one-person-at-a-time weekly editor. Warns (but doesn't
 * block) when a selected employee already has a *different* shift on one of
 * the selected days, since saving here overwrites just those days for them.
 */
export default function BulkAssignModal({
  shift,
  allEmployees,
  getConflict,
  onClose,
}: {
  shift: { id: string; name: string | null; startTime: string; endTime: string };
  allEmployees: PickableEmployee[];
  getConflict: ConflictLookup;
  onClose: () => void;
}) {
  const router = useRouter();
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleWeekday(weekday: number) {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return next;
    });
  }

  const conflicts = useMemo(() => {
    const affectedDays = new Set<string>();
    let affectedCount = 0;
    for (const id of employeeIds) {
      let hasConflict = false;
      for (const weekday of weekdays) {
        const existing = getConflict(id, weekday);
        if (existing && existing.shiftId !== shift.id) {
          affectedDays.add(WEEKDAY_LABELS[weekday]);
          hasConflict = true;
        }
      }
      if (hasConflict) affectedCount++;
    }
    return { count: affectedCount, days: [...affectedDays] };
  }, [employeeIds, weekdays, getConflict, shift.id]);

  async function handleSave() {
    if (employeeIds.length === 0) {
      setError("Select at least one employee.");
      return;
    }
    if (weekdays.size === 0) {
      setError("Select at least one day.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/admin/shifts/${shift.id}/bulk-assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekdays: [...weekdays], employeeIds }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-2 rounded-lg shadow-2xl border border-white/50 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-medium text-foreground">Bulk assign employees</h2>
            <p className="text-xs text-secondary mt-0.5">
              {shift.name || "Shift"} &middot; {formatTimeLabel(shift.startTime)}–{formatTimeLabel(shift.endTime)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-muted-2 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-muted-2 mb-1.5 block">
              Apply on these days
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, weekday) => (
                <button
                  key={weekday}
                  type="button"
                  onClick={() => toggleWeekday(weekday)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    weekdays.has(weekday)
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-surface text-muted border border-border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-2 mb-1.5 block">
              Employees
            </label>
            <MultiEmployeePicker
              employees={allEmployees}
              selectedIds={employeeIds}
              onChange={setEmployeeIds}
              emptyLabel="No active Office-mode employees to add."
            />
          </div>

          {conflicts.count > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                {conflicts.count} employee{conflicts.count === 1 ? "" : "s"} already{" "}
                {conflicts.count === 1 ? "has" : "have"} a different shift on{" "}
                {conflicts.days.join(", ")} — this will replace it for those days only.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-6 pt-0 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-white border border-border py-2.5 text-sm font-medium text-muted hover:bg-surface transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : employeeIds.length > 0
                ? `Assign ${employeeIds.length} employee${employeeIds.length === 1 ? "" : "s"}`
                : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
