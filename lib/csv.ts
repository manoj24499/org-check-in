// Shared CSV-quoting helper — same convention as the existing ad-hoc
// versions in app/api/admin/attendance/export and .../leave-requests/export,
// pulled out here so lib/employeeCleanup.ts's archival snapshots don't have
// to duplicate it a third time.
export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Joins a header line and pre-built row strings into one CSV document. */
export function buildCsv(header: string, rows: string[]): string {
  return `${header}\n${rows.join("\n")}`;
}
