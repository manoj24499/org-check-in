"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, IconChip, Pill } from "./admin/ui";
import {
  MAX_BULK_ROWS,
  parseEmployeeCsv,
  templateCsv,
  type ParsedEmployeeRow,
} from "@/lib/bulkEmployeeCsv";

interface SubmittedRow {
  name: string;
  email: string;
  workMode: "OFFICE" | "WFH" | "FIELD";
  homeLatitude?: number;
  homeLongitude?: number;
  homeRadiusMeters?: number;
}

interface CreatedEmployee {
  name: string;
  employeeCode: string;
  pin: string;
}

/** Quotes a CSV field only when it actually needs it (contains a comma,
 * quote, or newline) — matches how every spreadsheet app writes CSV, so the
 * downloaded file round-trips cleanly if re-opened/re-edited. */
function toCsvField(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * The same columns the admin originally uploaded, with EmployeeID and PIN
 * appended after the location columns — a durable, archivable record of
 * this batch's credentials, since the on-screen table (and the PINs in it)
 * only ever exist for this one page view (see the schema comment on
 * User.pinHash — there's no "look it up later" for a PIN, same as a
 * password). Matched to `created` by array index: the backend's bulk-create
 * loop processes rows in the exact order submitted and pushes each result
 * in that same order, so index-zipping the two arrays here is safe.
 */
function downloadCredentialsCsv(rows: SubmittedRow[], created: CreatedEmployee[]) {
  const header = ["Name", "Email", "WorkMode", "HomeLatitude", "HomeLongitude", "HomeRadius", "EmployeeID", "PIN"];
  const lines = [header.join(",")];
  rows.forEach((row, i) => {
    const c = created[i];
    lines.push(
      [
        toCsvField(row.name),
        toCsvField(row.email),
        toCsvField(row.workMode),
        toCsvField(row.homeLatitude),
        toCsvField(row.homeLongitude),
        toCsvField(row.homeRadiusMeters),
        toCsvField(c?.employeeCode),
        toCsvField(c?.pin),
      ].join(","),
    );
  });
  downloadBlob(`employee-credentials-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"));
}

const FORMAT_COLUMNS: { column: string; required: string; example: string; notes: string }[] = [
  { column: "Name", required: "Required", example: "Priya Sharma", notes: "Full name" },
  { column: "Email", required: "Required", example: "priya@acme.com", notes: "Must be unique" },
  { column: "WorkMode", required: "Optional", example: "OFFICE", notes: "OFFICE, WFH or FIELD (default OFFICE)" },
  { column: "HomeLatitude", required: "WFH only", example: "12.9716", notes: "Between -90 and 90" },
  { column: "HomeLongitude", required: "WFH only", example: "77.5946", notes: "Between -180 and 180" },
  { column: "HomeRadius", required: "Optional", example: "75", notes: "Meters (default 50)" },
];

const MAX_FILE_BYTES = 1_000_000;

export default function BulkAddEmployeeForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [submittedRows, setSubmittedRows] = useState<SubmittedRow[]>([]);
  const [created, setCreated] = useState<CreatedEmployee[] | null>(null);
  // null = follow the default (open until some rows are loaded); set once the admin toggles it.
  const [formatOpen, setFormatOpen] = useState<boolean | null>(null);

  const parsed = useMemo(() => parseEmployeeCsv(csvText), [csvText]);
  const badRows = parsed.rows.filter((r) => r.problems.length > 0);
  const goodCount = parsed.rows.length - badRows.length;
  const showFormat = formatOpen ?? parsed.rows.length === 0;
  const canSubmit = parsed.rows.length > 0 && badRows.length === 0 && !parsed.tooMany;

  async function readFile(file: File) {
    setError(null);
    const lower = file.name.toLowerCase();
    if (/\.(xlsx|xls|xlsm|numbers)$/.test(lower)) {
      setError("Excel files aren't supported directly. In Excel choose File → Save As → CSV (Comma delimited), then upload that file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large. Keep it under 1 MB (about 500 employees).");
      return;
    }
    try {
      const text = await file.text();
      setCsvText(text);
      setFileName(file.name);
    } catch {
      setError("Couldn't read that file. Try saving it as a plain CSV and uploading again.");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  }

  function clearFile() {
    setCsvText("");
    setFileName(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const employeesToCreate: SubmittedRow[] = parsed.rows.map((r) => ({
      name: r.name,
      email: r.email,
      workMode: r.workMode,
      homeLatitude: r.homeLatitude,
      homeLongitude: r.homeLongitude,
      homeRadiusMeters: r.homeRadiusMeters,
    }));

    const res = await fetch("/api/admin/employees/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeesToCreate),
    });

    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSubmittedRows(employeesToCreate);
    setCreated(data.created);
    router.refresh();
  }

  function closeAll() {
    setOpen(false);
    setCreated(null);
    setSubmittedRows([]);
    setError(null);
    setCsvText("");
    setFileName(null);
    setFormatOpen(null);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={BTN_SECONDARY}>
        <Upload className="h-4 w-4" />
        Bulk Add
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/50 bg-white shadow-2xl">
            {created ? (
              <div className="flex flex-col gap-4 overflow-y-auto p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <IconChip icon={CheckCircle2} tone="green" />
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-900">Employees created</h2>
                      <p className="mt-0.5 text-sm text-slate-500">
                        Copy, screenshot or download the PINs below. They will not be shown again.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCredentialsCsv(submittedRows, created)}
                    className={`${BTN_PRIMARY} shrink-0`}
                  >
                    <Download className="h-4 w-4" />
                    Download CSV
                  </button>
                </div>
                <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-500">ID</th>
                        <th className="px-4 py-3 font-medium text-slate-500">Name</th>
                        <th className="px-4 py-3 font-medium text-slate-500">PIN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {created.map((c) => (
                        <tr key={c.employeeCode}>
                          <td className="px-4 py-3 font-medium text-slate-800">{c.employeeCode}</td>
                          <td className="px-4 py-3 text-slate-700">{c.name}</td>
                          <td className="px-4 py-3 font-mono font-medium tracking-widest text-orange-600">{c.pin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={closeAll} className={`${BTN_PRIMARY} w-full !py-2.5`}>
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
                  <div className="flex items-start gap-3">
                    <IconChip icon={FileSpreadsheet} tone="orange" />
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-900">Bulk add employees</h2>
                      <p className="mt-0.5 text-sm text-slate-500">
                        Upload a CSV file. Each person gets an ID and a PIN automatically.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeAll}
                    aria-label="Close"
                    className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
                    <div>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".csv,.tsv,.txt,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void readFile(f);
                        }}
                      />
                      {fileName ? (
                        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{fileName}</p>
                            <p className="text-xs text-slate-500">
                              {parsed.rows.length} {parsed.rows.length === 1 ? "row" : "rows"} found
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            className="text-xs font-medium text-orange-600 hover:text-orange-700"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={clearFile}
                            aria-label="Remove file"
                            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={onDrop}
                          onClick={() => fileInput.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              fileInput.current?.click();
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
                            dragging
                              ? "border-orange-400 bg-orange-50"
                              : "border-slate-300 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/50"
                          }`}
                        >
                          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-500/10 text-orange-600">
                            <UploadCloud className="h-6 w-6" />
                          </span>
                          <p className="text-sm font-medium text-slate-800">
                            Drag and drop your file here, or <span className="text-orange-600">browse</span>
                          </p>
                          <p className="text-xs text-slate-500">CSV, TSV or TXT · up to {MAX_BULK_ROWS} employees · max 1 MB</p>
                        </div>
                      )}
                    </div>

                  {/* Preview */}
                  {parsed.rows.length > 0 && (
                    <div className="rounded-xl border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">Preview</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone="green" dot>
                            {goodCount} ready
                          </Pill>
                          {badRows.length > 0 && (
                            <Pill tone="red" dot>
                              {badRows.length} need fixing
                            </Pill>
                          )}
                        </div>
                      </div>
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-4 py-2 font-semibold">Line</th>
                              <th className="px-4 py-2 font-semibold">Name</th>
                              <th className="px-4 py-2 font-semibold">Email</th>
                              <th className="px-4 py-2 font-semibold">Mode</th>
                              <th className="px-4 py-2 font-semibold">Check</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parsed.rows.map((r: ParsedEmployeeRow) => (
                              <tr key={r.line} className={r.problems.length ? "bg-red-50/50" : undefined}>
                                <td className="px-4 py-2 tabular-nums text-slate-400">{r.line}</td>
                                <td className="max-w-[160px] truncate px-4 py-2 text-slate-800">{r.name || "—"}</td>
                                <td className="max-w-[200px] truncate px-4 py-2 text-slate-600">{r.email || "—"}</td>
                                <td className="px-4 py-2 text-slate-600">{r.workMode}</td>
                                <td className="px-4 py-2">
                                  {r.problems.length === 0 ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> OK
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-start gap-1 text-red-600">
                                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                      {r.problems.join("; ")}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {parsed.tooMany && (
                        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-red-600">
                          Only the first {MAX_BULK_ROWS} rows are shown. Split the file into batches of {MAX_BULK_ROWS} or fewer.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Expected format */}
                  <div className="rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setFormatOpen(!showFormat)}
                        aria-expanded={showFormat}
                        className="flex items-center gap-2 text-left"
                      >
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showFormat ? "" : "-rotate-90"}`} />
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">Expected file format</span>
                          <span className="block text-xs text-slate-500">
                            One employee per row, columns in this order. A header row is optional.
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadBlob("employees-template.csv", templateCsv())}
                        className={`${BTN_SECONDARY} !px-3 !py-1.5 !text-xs`}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download template
                      </button>
                    </div>
                    {showFormat && (
                    <>
                    <div className="overflow-x-auto border-t border-slate-100">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold">#</th>
                            <th className="px-4 py-2 font-semibold">Column</th>
                            <th className="px-4 py-2 font-semibold">Required?</th>
                            <th className="px-4 py-2 font-semibold">Example</th>
                            <th className="px-4 py-2 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {FORMAT_COLUMNS.map((c, i) => (
                            <tr key={c.column}>
                              <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-4 py-2 font-mono font-medium text-slate-800">{c.column}</td>
                              <td className="px-4 py-2">
                                <Pill tone={c.required === "Required" ? "orange" : c.required === "WFH only" ? "indigo" : "slate"}>
                                  {c.required}
                                </Pill>
                              </td>
                              <td className="px-4 py-2 font-mono text-slate-600">{c.example}</td>
                              <td className="px-4 py-2 text-slate-500">{c.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                      Save from Excel or Google Sheets as <strong className="text-slate-700">CSV</strong>. Leave the location
                      columns blank for OFFICE and FIELD employees. FIELD employees are never geofenced.
                    </p>
                    </>
                    )}
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                  <p className="mr-auto text-xs text-slate-500">
                    {parsed.rows.length === 0
                      ? "Add a file to continue."
                      : canSubmit
                        ? `${goodCount} ${goodCount === 1 ? "employee" : "employees"} will be created.`
                        : "Fix the highlighted rows in your file, then upload it again."}
                  </p>
                  <button type="button" onClick={closeAll} className={BTN_SECONDARY}>
                    Cancel
                  </button>
                  <button disabled={loading || !canSubmit} className={BTN_PRIMARY}>
                    {loading ? "Creating…" : "Create employees"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
