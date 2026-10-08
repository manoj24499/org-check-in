"use client";

import { useState } from "react";
import { Check, Download, FileSpreadsheet, Loader2, Search, X } from "lucide-react";
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
  // Every field worker starts ticked; untick to narrow the report down.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(employees.map((e) => e.id)));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = selected.size === employees.length;
  const q = query.trim().toLowerCase();
  const shown = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q))
    : employees;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(employees.map((e) => e.id)));
  }

  const days = from && to ? daysBetween(from, to) : 0;
  const rangeError =
    selected.size === 0
      ? "Select at least one employee."
      : !from || !to
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
      const qs = new URLSearchParams({ from, to, employeeIds: allSelected ? "all" : [...selected].join(",") });
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
    "w-full rounded-xl border border-black/10 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30";
  const box = (on: boolean) =>
    `grid h-4 w-4 shrink-0 place-items-center rounded border ${
      on ? "border-orange-600 bg-orange-600 text-white" : "border-slate-300 bg-white"
    }`;
  const message = rangeError && (from || to || selected.size === 0) ? rangeError : error;

  return (
    <>
      <button onClick={() => setOpen(true)} className={BTN_SECONDARY} disabled={employees.length === 0}>
        <Download className="h-4 w-4" />
        Export to Excel
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/50 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <IconChip icon={FileSpreadsheet} tone="green" size="sm" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight tracking-[-0.01em] text-slate-900">Export field report</h2>
                  <p className="truncate text-xs text-slate-500">Places, times reached and distance travelled · Excel</p>
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

            {/* Body: employees on the left, dates on the right (stacked on a phone) */}
            <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600">Employees</label>
                  <span className="text-xs text-slate-500">
                    {selected.size} of {employees.length}
                  </span>
                </div>
                <div className="overflow-hidden rounded-xl border border-black/10">
                  {employees.length > 6 && (
                    <div className="relative border-b border-black/[0.06]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="export-employee-search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search name or ID"
                        className="w-full bg-slate-50 py-2 pl-9 pr-3 text-sm focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex w-full items-center gap-2.5 border-b border-black/[0.06] bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100"
                  >
                    <span className={box(allSelected)}>{allSelected && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                    All field workers
                  </button>
                  <ul className="max-h-52 overflow-y-auto">
                    {shown.map((e) => {
                      const on = selected.has(e.id);
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => toggle(e.id)}
                            role="checkbox"
                            aria-checked={on}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <span className={box(on)}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                            <span className="min-w-0 flex-1 truncate">{e.name}</span>
                            <span className="text-xs text-slate-400">{e.employeeCode}</span>
                          </button>
                        </li>
                      );
                    })}
                    {shown.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No match.</li>}
                  </ul>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">Dates</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input id="export-from" type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={field} />
                    <input id="export-to" type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={field} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => preset("today")} className={chip}>Today</button>
                    <button type="button" onClick={() => preset("yesterday")} className={chip}>Yesterday</button>
                    <button type="button" onClick={() => preset("week")} className={chip}>Last 7 days</button>
                    <button type="button" onClick={() => preset("month")} className={chip}>This month</button>
                  </div>
                </div>
                <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                  <span className="font-medium text-slate-700">3 sheets:</span> Daily summary, Logged stops, Detected stops.
                  Up to {MAX_DAYS} days; place names for detected stops are looked up for ranges of 3 days or fewer.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <p className={`min-w-0 text-sm ${message ? "text-red-600" : "text-slate-500"}`}>
                {message ?? `${selected.size} ${selected.size === 1 ? "employee" : "employees"} · ${days} ${days === 1 ? "day" : "days"}`}
              </p>
              <div className="flex gap-2">
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
        </div>
      )}
    </>
  );
}
