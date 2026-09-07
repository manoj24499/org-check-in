"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, X, Plus, Users } from "lucide-react";
import BulkAssignModal, { type ConflictLookup } from "./BulkAssignModal";
import type { PickableEmployee } from "./MultiEmployeePicker";

type ShiftAssignment = {
  weekday: number;
  // createdAt arrives as an ISO string — Date props get serialized crossing
  // the server/client component boundary.
  user: { id: string; employeeCode: string; name: string; createdAt: string };
};

type Shift = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
  assignments: ShiftAssignment[];
};

interface ShiftTableProps {
  shifts: Shift[];
  allEmployees: PickableEmployee[];
}

type EditingState = {
  id: string | null; // null == creating a new shift
  name: string;
  startTime: string;
  endTime: string;
};

// Same Date.getDay() convention (0 = Sunday ... 6 = Saturday) as
// components/ShiftScheduleEditor.tsx, single-letter for the compact chip.
const WEEKDAY_CHIP_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Groups a shift's flat (weekday, user) assignment rows into one entry per
 * employee with the set of weekdays they're on this particular shift — the
 * same employee can also appear on a different shift's roster for the
 * weekdays not covered here (see ShiftScheduleEditor, where this is set).
 * Sorted by join order (oldest first), matching /admin/employees and the
 * dashboard rather than alphabetically. */
function groupByEmployee(assignments: ShiftAssignment[]) {
  const byUser = new Map<string, { name: string; createdAt: string; weekdays: Set<number> }>();
  for (const a of assignments) {
    const entry =
      byUser.get(a.user.id) ?? { name: a.user.name, createdAt: a.user.createdAt, weekdays: new Set<number>() };
    entry.weekdays.add(a.weekday);
    byUser.set(a.user.id, entry);
  }
  return [...byUser.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ShiftTable({ shifts: initialShifts, allEmployees }: ShiftTableProps) {
  const router = useRouter();
  const [shifts, setShifts] = useState(initialShifts);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkAssignShift, setBulkAssignShift] = useState<Shift | null>(null);
  // Shift ids toggled OFF by the filter row above the table — starts empty
  // (everything visible) so a newly added shift is never hidden by default.
  const [hiddenShiftIds, setHiddenShiftIds] = useState<Set<string>>(new Set());

  function toggleShiftFilter(id: string) {
    setHiddenShiftIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Every employee's current shift per weekday, across *all* shifts — used
  // by BulkAssignModal to warn when a bulk assignment would silently
  // override a different shift someone already has on one of the chosen
  // days (see ConflictLookup).
  const getConflict: ConflictLookup = useMemo(() => {
    const index = new Map<string, Map<number, { shiftId: string; label: string }>>();
    for (const s of shifts) {
      const label = s.name || formatTimeLabel(s.startTime);
      for (const a of s.assignments) {
        const userMap = index.get(a.user.id) ?? new Map();
        userMap.set(a.weekday, { shiftId: s.id, label });
        index.set(a.user.id, userMap);
      }
    }
    return (userId, weekday) => index.get(userId)?.get(weekday) ?? null;
  }, [shifts]);

  function openAdd() {
    setEditing({ id: null, name: "", startTime: "09:00", endTime: "18:00" });
    setError(null);
  }

  function openEdit(shift: Shift) {
    setEditing({ id: shift.id, name: shift.name ?? "", startTime: shift.startTime, endTime: shift.endTime });
    setError(null);
  }

  async function handleSave() {
    if (!editing) return;
    // Equal times only — a reversed pair (e.g. 16:00-02:00) is a valid
    // overnight shift, not an error (see the "+1d" hint next to the End
    // time field, and prisma/schema.prisma's comment on Shift).
    if (editing.startTime === editing.endTime) {
      setError("Start and end time can't be the same.");
      return;
    }
    setLoading(true);
    setError(null);

    const body = {
      name: editing.name.trim() || undefined,
      startTime: editing.startTime,
      endTime: editing.endTime,
    };

    const res = await fetch(
      editing.id ? `/api/admin/shifts/${editing.id}` : "/api/admin/shifts",
      {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    if (editing.id) {
      setShifts((prev) =>
        prev.map((s) => (s.id === data.shift.id ? data.shift : s)),
      );
    } else {
      setShifts((prev) => [...prev, data.shift]);
    }
    setEditing(null);
    router.refresh();
  }

  async function handleDelete(shift: Shift) {
    const employeeCount = groupByEmployee(shift.assignments).length;
    const employeeNote =
      employeeCount > 0
        ? ` ${employeeCount} employee(s) will lose this shift on the days it covered.`
        : "";
    if (
      !confirm(
        `Delete "${shift.name || formatTimeLabel(shift.startTime)}"?${employeeNote}`,
      )
    ) {
      return;
    }
    setDeletingId(shift.id);
    await fetch(`/api/admin/shifts/${shift.id}`, { method: "DELETE" });
    setShifts((prev) => prev.filter((s) => s.id !== shift.id));
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            Shifts
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Any employee can be assigned a shift. Office employees are marked
            Permission or Half-day leave when they check in late, based on
            whichever shift they&apos;re on that day; everyone with a shift
            (Office, WFH, or Field) gets a reminder push near their shift end.
            Assign an employee&apos;s weekly schedule from their{" "}
            <Link href="/admin/employees" className="text-primary font-semibold hover:text-primary-dark transition-colors">
              employee page
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          Add shift
        </button>
      </div>

      {shifts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHiddenShiftIds(new Set())}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
              hiddenShiftIds.size === 0
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-surface-2 text-muted border-border hover:bg-surface"
            }`}
          >
            All shifts
          </button>
          {shifts.map((shift) => (
            <button
              key={shift.id}
              type="button"
              onClick={() => toggleShiftFilter(shift.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                !hiddenShiftIds.has(shift.id)
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-surface-2 text-muted border-border hover:bg-surface"
              }`}
            >
              {shift.name || "Shift"}{" "}
              <span className="opacity-70">
                {formatTimeLabel(shift.startTime)}–{formatTimeLabel(shift.endTime)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-secondary text-left border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Shift
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Start
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  End
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Who&apos;s on it
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {shifts.map((shift) => {
                const roster = groupByEmployee(shift.assignments);
                const dimmed = hiddenShiftIds.has(shift.id);
                return (
                  <tr
                    key={shift.id}
                    className={`hover:bg-primary/5 transition-colors duration-200 align-top ${
                      dimmed ? "opacity-40" : ""
                    }`}
                  >
                    <td className="px-6 py-4 text-foreground font-semibold whitespace-nowrap">
                      {shift.name || formatTimeLabel(shift.startTime)}
                    </td>
                    <td className="px-6 py-4 text-secondary whitespace-nowrap">
                      {formatTimeLabel(shift.startTime)}
                    </td>
                    <td className="px-6 py-4 text-secondary whitespace-nowrap">
                      {formatTimeLabel(shift.endTime)}
                      {shift.endTime <= shift.startTime && (
                        <span className="ml-1 text-[10px] font-semibold text-primary-dark align-top">+1d</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {roster.length === 0 ? (
                        <span className="text-secondary text-xs">
                          No one assigned yet
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          {roster.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-2.5">
                              <span className="text-xs font-semibold text-muted-2 min-w-[64px] truncate">
                                {emp.name}
                              </span>
                              <div className="flex gap-1">
                                {WEEKDAY_CHIP_LABELS.map((label, weekday) => (
                                  <span
                                    key={weekday}
                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                                      emp.weekdays.has(weekday)
                                        ? "bg-primary/15 text-primary-dark"
                                        : "bg-surface text-muted border border-border-soft"
                                    }`}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setBulkAssignShift(shift)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
                        >
                          <Users className="w-3.5 h-3.5" />
                          Bulk assign
                        </button>
                        <button
                          onClick={() => openEdit(shift)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(shift)}
                          disabled={deletingId === shift.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingId === shift.id ? "Removing…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shifts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-secondary"
                  >
                    No shifts yet. Click Add shift to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md bg-surface-2 rounded-lg shadow-2xl border border-white/50 overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-medium text-foreground">
                {editing.id ? "Edit shift" : "Add a shift"}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-muted hover:text-muted-2 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-muted-2">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="e.g. General Shift"
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Start time
                  </label>
                  <input
                    type="time"
                    value={editing.startTime}
                    onChange={(e) =>
                      setEditing({ ...editing, startTime: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    End time
                  </label>
                  <input
                    type="time"
                    value={editing.endTime}
                    onChange={(e) =>
                      setEditing({ ...editing, endTime: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                  {editing.startTime && editing.endTime && editing.endTime <= editing.startTime && (
                    <p className="text-xs text-primary-dark mt-1">Ends the next day (overnight shift).</p>
                  )}
                </div>
              </div>

              {!editing.id && (
                <p className="text-xs text-secondary">
                  Assign employees afterward with Bulk assign, or from their
                  individual employee page.
                </p>
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
                onClick={() => setEditing(null)}
                className="flex-1 rounded-lg bg-white border border-border py-2.5 text-sm font-medium text-muted hover:bg-surface transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition disabled:opacity-50"
              >
                {loading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkAssignShift && (
        <BulkAssignModal
          shift={bulkAssignShift}
          allEmployees={allEmployees}
          getConflict={getConflict}
          onClose={() => setBulkAssignShift(null)}
        />
      )}
    </div>
  );
}
