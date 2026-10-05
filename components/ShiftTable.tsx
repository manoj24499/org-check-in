"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, X, Plus, Users, CalendarClock, Sun, Sunrise, Sunset, Moon, type LucideIcon } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, Card, EmptyState, IconChip, Page, PageHeader, Pill, type Tone } from "./admin/ui";
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


/** "07:00" -> a time-of-day glyph + tint, from when the shift starts. */
function timeOfDay(start: string): { icon: LucideIcon; tone: Tone } {
  const h = Number(start.split(":")[0]);
  if (h >= 4 && h < 11) return { icon: Sunrise, tone: "amber" };
  if (h >= 11 && h < 17) return { icon: Sun, tone: "orange" };
  if (h >= 17 && h < 21) return { icon: Sunset, tone: "red" };
  return { icon: Moon, tone: "indigo" };
}

/** Shift length, e.g. "8h" or "8h 30m"; an end at or before the start means it runs overnight. */
function durationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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
    <Page>
      <PageHeader
        eyebrow="Workforce"
        title="Shifts"
        subtitle={
          <>
            Office employees are marked Permission or Half-day leave when they check in late for their shift, and everyone
            with a shift gets a reminder near its end. Assign weekly schedules from each{" "}
            <Link href="/admin/employees" className="font-medium text-orange-600 transition-colors hover:text-orange-700">
              employee page
            </Link>
            .
          </>
        }
        actions={
          <button type="button" onClick={openAdd} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" />
            Add shift
          </button>
        }
      />

      {shifts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHiddenShiftIds(new Set())}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors ${
              hiddenShiftIds.size === 0
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            All shifts
          </button>
          {shifts.map((shift) => (
            <button
              key={shift.id}
              type="button"
              onClick={() => toggleShiftFilter(shift.id)}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors ${
                !hiddenShiftIds.has(shift.id)
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {shift.name || "Shift"}
            </button>
          ))}
        </div>
      )}

      {shifts.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="No shifts yet"
            text="Create your first shift, then assign employees to it for lateness tracking and shift-end reminders."
            action={
              <button type="button" onClick={openAdd} className={BTN_PRIMARY}>
                <Plus className="h-4 w-4" />
                Add shift
              </button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {shifts.map((shift) => {
            const roster = groupByEmployee(shift.assignments);
            const dimmed = hiddenShiftIds.has(shift.id);
            const tod = timeOfDay(shift.startTime);
            const overnight = shift.endTime <= shift.startTime;
            return (
              <div
                key={shift.id}
                className={`${CARD} flex flex-col overflow-hidden transition-opacity ${dimmed ? "opacity-40" : ""}`}
              >
                <div className="flex items-start gap-3.5 px-5 pb-4 pt-5">
                  <IconChip icon={tod.icon} tone={tod.tone} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-slate-900">
                      {shift.name || formatTimeLabel(shift.startTime)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] tabular-nums text-slate-600">
                      {formatTimeLabel(shift.startTime)} <span className="text-slate-300">→</span>{" "}
                      {formatTimeLabel(shift.endTime)}
                      {overnight && <Pill tone="indigo">+1 day</Pill>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-slate-900">
                      {durationLabel(shift.startTime, shift.endTime)}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">long</p>
                  </div>
                </div>

                <div className="flex-1 border-t border-slate-100 px-5 py-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Team</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                      {roster.length}
                    </span>
                  </div>
                  {roster.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[13px] text-slate-500">
                      No one is assigned to this shift yet.
                    </p>
                  ) : (
                    <ul className="flex max-h-56 flex-col gap-2.5 overflow-y-auto pr-1">
                      {roster.map((emp) => (
                        <li key={emp.id} className="flex items-center gap-2.5">
                          <Avatar name={emp.name} size={28} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{emp.name}</span>
                          <span className="flex gap-1">
                            {WEEKDAY_CHIP_LABELS.map((label, weekday) => (
                              <span
                                key={weekday}
                                className={`flex h-[22px] w-[22px] items-center justify-center rounded-md text-[10px] font-semibold ${
                                  emp.weekdays.has(weekday)
                                    ? "bg-orange-500 text-white"
                                    : "bg-slate-100 text-slate-400"
                                }`}
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                  <button
                    onClick={() => setBulkAssignShift(shift)}
                    className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-xs`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    Bulk assign
                  </button>
                  <button onClick={() => openEdit(shift)} className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-xs`}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(shift)}
                    disabled={deletingId === shift.id}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === shift.id ? "Removing…" : "Delete"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-white/50 overflow-hidden max-h-[90vh] flex flex-col"
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
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
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
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
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
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
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
                <div className="rounded-xl bg-red-50 text-red-600 p-3 text-sm border border-red-100">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 pt-0 shrink-0">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl bg-white border border-border py-2.5 text-sm font-medium text-muted hover:bg-surface transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 rounded-xl border border-transparent bg-orange-600 shadow-sm text-white py-2.5 text-sm font-medium hover:bg-orange-700 transition disabled:opacity-50"
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
    </Page>
  );
}
