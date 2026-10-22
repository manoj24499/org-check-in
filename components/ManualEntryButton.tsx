"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, X } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY } from "./admin/ui";

const MAX_DAYS_BACK = 7; // keep in step with MANUAL_ENTRY_MAX_DAYS_BACK in lib/manualEntry.ts

function localDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FIELD =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400";

/**
 * "Add manual entry" for the employee detail page: an admin records a day's
 * check-in/check-out the device missed. Both records are stamped MANUAL with
 * the reason and the admin's name (see /api/admin/employees/[id]/manual-entry).
 */
export default function ManualEntryButton({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("18:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const max = localDateKey(today);
  const min = localDateKey(new Date(today.getTime() - MAX_DAYS_BACK * 86_400_000));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/manual-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, checkIn, checkOut, reason }),
      });
      const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${BTN_SECONDARY} !px-3.5 !py-1.5 !text-xs`}>
        <PencilLine className="h-3.5 w-3.5" />
        Add manual entry
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Add manual entry</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Record a day {employeeName} worked but the device missed. Last {MAX_DAYS_BACK} days only.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-medium text-slate-600">
                Date
                <input type="date" required min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Check-in
                <input type="time" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Check-out
                <input type="time" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={`${FIELD} mt-1`} />
              </label>
              <label className="col-span-2 text-xs font-medium text-slate-600">
                Reason
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Kiosk device was down"
                  className={`${FIELD} mt-1`}
                />
              </label>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={`${BTN_SECONDARY} !px-4 !py-2 !text-sm`}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !date} className={`${BTN_PRIMARY} !px-4 !py-2 !text-sm`}>
                {saving ? "Saving…" : "Save entry"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
