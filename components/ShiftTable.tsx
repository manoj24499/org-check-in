"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, Plus, Clock } from "lucide-react";
import MultiEmployeePicker, {
  type PickableEmployee,
} from "./MultiEmployeePicker";

type ShiftEmployee = { id: string; employeeCode: string; name: string };

type Shift = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
  employees: ShiftEmployee[];
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
  employeeIds: string[];
};

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function ShiftTable({
  shifts: initialShifts,
  allEmployees,
}: ShiftTableProps) {
  const router = useRouter();
  const [shifts, setShifts] = useState(initialShifts);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openAdd() {
    setEditing({
      id: null,
      name: "",
      startTime: "09:00",
      endTime: "18:00",
      employeeIds: [],
    });
    setError(null);
  }

  function openEdit(shift: Shift) {
    setEditing({
      id: shift.id,
      name: shift.name ?? "",
      startTime: shift.startTime,
      endTime: shift.endTime,
      employeeIds: shift.employees.map((e) => e.id),
    });
    setError(null);
  }

  async function handleSave() {
    if (!editing) return;
    if (editing.startTime >= editing.endTime) {
      setError("End time must be after start time.");
      return;
    }
    setLoading(true);
    setError(null);

    const body = {
      name: editing.name.trim() || undefined,
      startTime: editing.startTime,
      endTime: editing.endTime,
      employeeIds: editing.employeeIds,
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
    const employeeNote =
      shift.employees.length > 0
        ? ` ${shift.employees.length} employee(s) will be unassigned from it.`
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
            Office employees assigned to a shift are marked Permission or
            Half-day leave when they check in late, based on the shift&apos;s
            start time.
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
                  Employees
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {shifts.map((shift) => (
                <tr
                  key={shift.id}
                  className="hover:bg-primary/5 transition-colors duration-200 align-top"
                >
                  <td className="px-6 py-4 text-foreground font-semibold whitespace-nowrap">
                    {shift.name || formatTimeLabel(shift.startTime)}
                  </td>
                  <td className="px-6 py-4 text-secondary whitespace-nowrap">
                    {formatTimeLabel(shift.startTime)}
                  </td>
                  <td className="px-6 py-4 text-secondary whitespace-nowrap">
                    {formatTimeLabel(shift.endTime)}
                  </td>
                  <td className="px-6 py-4">
                    {shift.employees.length === 0 ? (
                      <span className="text-secondary text-xs">
                        No one assigned yet
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-w-md">
                        {shift.employees.map((emp) => (
                          <span
                            key={emp.id}
                            className="inline-flex items-center rounded-full bg-surface border border-border px-2.5 py-1 text-xs font-semibold text-muted-2"
                          >
                            {emp.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
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
              ))}
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
            className="w-full max-w-lg bg-surface-2 rounded-lg shadow-2xl border border-white/50 overflow-hidden max-h-[90vh] flex flex-col"
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
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-2 flex items-center gap-1.5 mb-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Employees in this shift
                </label>
                <MultiEmployeePicker
                  employees={allEmployees}
                  selectedIds={editing.employeeIds}
                  onChange={(employeeIds) =>
                    setEditing({ ...editing, employeeIds })
                  }
                  emptyLabel="No active Office-mode employees to add."
                />
              </div>

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
    </div>
  );
}
