// A leading =, +, -, or @ makes Excel/Google Sheets/LibreOffice read the
// *whole cell* as a formula the moment someone opens the file, regardless of
// the surrounding quotes — CSV quoting only controls how the value is
// parsed back into a string, not how a spreadsheet app then interprets that
// string's own content. Every field this app writes into a CSV ultimately
// traces back to free text someone typed somewhere (an employee/admin name,
// a leave request's reason, a reimbursement note, an admin's review note),
// so any of them could start with one of these characters, intentionally or
// not — from a malicious "=HYPERLINK(...)"/"=cmd|..." payload down to
// something as mundane as an admin typing "-5 days" as a note.
const FORMULA_INJECTION_PREFIXES = ["=", "+", "-", "@"];

/**
 * Shared CSV-quoting helper — same convention as the existing ad-hoc
 * versions in app/api/admin/attendance/export and .../leave-requests/export,
 * pulled out here so lib/employeeCleanup.ts's archival snapshots don't have
 * to duplicate it a third time. Prefixing a formula-triggering value with a
 * single quote is the standard mitigation (OWASP's CSV injection guidance)
 * — every affected spreadsheet app treats a leading `'` as "the rest of this
 * is literal text," and it's invisible/harmless everywhere else a CSV file
 * might be read (this app's own re-import paths, if any, a text editor, a
 * script parsing the file with a real CSV parser).
 */
export function csvField(value: string): string {
  const safe = FORMULA_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Joins a header line and pre-built row strings into one CSV document. */
export function buildCsv(header: string, rows: string[]): string {
  return `${header}\n${rows.join("\n")}`;
}

/**
 * Hard ceiling for any admin CSV export query (attendance, leave requests).
 * Neither export route has a `where` by default — an admin expects "export
 * everything" to mean everything — so rather than silently narrowing that,
 * this caps the worst case: a `take` this size is already tens of thousands
 * of employee-days away from anything this app's actual usage produces
 * today, but bounds query time/memory instead of letting an ever-growing,
 * never-purged table (see Attendance's own schema comment) eventually time
 * out or OOM the export route. `?from=`/`?to=` query params (YYYY-MM-DD) let
 * an admin scope a specific export themselves when they want to stay well
 * under this without waiting for it to become a real problem.
 */
export const CSV_EXPORT_ROW_CAP = 50_000;
