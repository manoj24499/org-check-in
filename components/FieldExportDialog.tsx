"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, IconChip } from "./admin/ui";

interface FieldEmployee {
  id: string;
  name: string;
  employeeCode: string;
}

const MAX_DAYS = 31;
const DAY_MS = 86_400_000;

// The admin picks calendar dates in their own (IST office) clock; "en-CA"
// formats as YYYY-MM-DD, which is what the API and <input type="date"> use.
const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS) + 1;
}

/**
 * "Export to Excel" for the Field workers page: pick a date range and one
 * field worker or all of them, and download a spreadsheet of where they went,
 * when they reached, and how far they travelled (see
 * app/api/admin/field-workers/export/route.ts for the sheets).
 */
export default function FieldExportDialog({ employees }: { employees: FieldEmployee[] }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => dayKey(new Date()));
  const [to, setTo] = useState(() => dayKey(new Date()));
  const [employeeId, setEmployeeId] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = from && to ? daysBetween(from, to) : 0;
  const rangeError =
    !from || !to
      ? "Pick both dates."
      : days < 1
        ? "The end date is before the start date."
        : days > MAX_DAYS
          ? `Pick a range of ${MAX_DAYS} days or fewer.`
          : null;

  function preset(kind: "today" | "yesterday" | "week" | "month") {
    const now = new Date();
    if (kind === "today") {
      setFrom(dayKey(now));
      setTo(dayKey(now));
    } else if (kind === "yesterday") {
      setFrom(dayKey(shift(now, -1)));
      setTo(dayKey(shift(now, -1)));
    } else if (kind === "week") {
      setFrom(dayKey(shift(now, -6)));
      setTo(dayKey(now));
    } else {
      setFrom(dayKey(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(dayKey(now));
    }
    setError(null);
  }

  async function download() {
    if (rangeError) return;
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to, employeeId });
      const res = await fetch(`/api/admin/field-workers/export?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't create the export. Please try again.");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "field-report.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the export. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const chip =
    "rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700";
  const field =
    "w-full rounded-xl border border-black/10 bg-slate-50 px-3 py-2.5 text-sm transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30";

  return (
    <>
      <button onClick={() => setOpen(true)} className={BTN_SECONDARY} disabled={employees.length === 0}>
        <Download className="h-4 w-4" />
        Export to Excel
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/50 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
              <div className="flex items-start gap-3">
                <IconChip icon={FileSpreadsheet} tone="green" />
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-900">Export field report</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Places visited, times reached and distance travelled, as an Excel file.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Employee</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={field}>
                  <option value="all">All field workers ({employees.length})</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">From</label>
                    <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={field} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">To</label>
                    <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={field} />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => preset("today")} className={chip}>Today</button>
                  <button type="button" onClick={() => preset("yesterday")} className={chip}>Yesterday</button>
                  <button type="button" onClick={() => preset("week")} className={chip}>Last 7 days</button>
                  <button type="button" onClick={() => preset("month")} className={chip}>This month</button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                <p className="mb-1 font-medium text-slate-700">The file has 3 sheets</p>
                <ul className="list-disc pl-4">
                  <li><strong className="font-medium text-slate-600">Daily summary:</strong> check-in/out, distance (km), stops, reimbursement</li>
                  <li><strong className="font-medium text-slate-600">Logged stops:</strong> place, description, time reached, map link</li>
                  <li><strong className="font-medium text-slate-600">Detected stops:</strong> where they stayed, arrived, left, time spent</li>
                </ul>
                <p className="mt-1.5">Up to {MAX_DAYS} days at a time. Place names for detected stops are looked up for ranges of 3 days or fewer.</p>
              </div>

              {(rangeError && (from || to) ? rangeError : error) && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                  {rangeError && (from || to) ? rangeError : error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button type="button" onClick={download} disabled={busy || !!rangeError} className={`${BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {busy ? "Preparing…" : "Download .xlsx"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
