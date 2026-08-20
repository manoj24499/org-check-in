"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type ShiftOption = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
};

type Assignment = { weekday: number; shiftId: string };

// JS Date.getDay() convention: index 0 = Sunday ... 6 = Saturday — same
// order every calendar component in this app already uses (see
// components/AttendanceCalendar.tsx's WEEKDAYS), so weekday numbers line up
// directly with array position with no remapping.
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const NO_SHIFT = "";

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Weekly shift schedule for one employee — replaces the single "assigned
 * shift" that used to live here. One dropdown per weekday lets an employee
 * rotate between shifts across the week (e.g. General Mon-Wed, Afternoon
 * Thu-Fri) instead of having exactly one shift for every day. Saves the
 * full week in one PUT to /api/admin/employees/[id]/shift-schedule.
 */
export default function ShiftScheduleEditor({
  userId,
  shifts,
  initialAssignments,
}: {
  userId: string;
  shifts: ShiftOption[];
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    for (let weekday = 0; weekday < 7; weekday++) map[weekday] = NO_SHIFT;
    for (const a of initialAssignments) map[a.weekday] = a.shiftId;
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const assignments = Object.entries(selection)
      .filter(([, shiftId]) => shiftId !== NO_SHIFT)
      .map(([weekday, shiftId]) => ({ weekday: Number(weekday), shiftId }));

    const res = await fetch(`/api/admin/employees/${userId}/shift-schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  if (shifts.length === 0) {
    return (
      <p className="text-secondary text-sm font-medium">
        No shifts exist yet.{" "}
        <Link href="/admin/shifts" className="text-primary font-semibold hover:text-primary-dark transition-colors">
          Create one
        </Link>{" "}
        to assign a weekly schedule.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-4">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <div key={weekday} className="rounded-lg border border-border p-2.5">
            <p className="text-xs font-medium text-secondary uppercase tracking-wide mb-1.5">
              {label}
            </p>
            <select
              value={selection[weekday]}
              onChange={(e) =>
                setSelection((prev) => ({ ...prev, [weekday]: e.target.value }))
              }
              className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            >
              <option value={NO_SHIFT}>No shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || formatTimeLabel(s.startTime)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-600 p-2.5 text-sm border border-red-100 mb-3">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {saved && !error && (
          <span className="text-sm text-emerald-600 font-medium">Saved.</span>
        )}
      </div>
    </div>
  );
}
