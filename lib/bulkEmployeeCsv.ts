/**
 * Parsing + validation for the admin "Bulk add employees" import (CSV / TSV /
 * pasted text). Pure functions, no DOM, so the rules live in one place and the
 * dialog only renders the result. The server re-validates everything
 * (app/api/admin/employees/bulk/route.ts); this exists to give the admin
 * row-by-row feedback *before* they submit.
 */

export type WorkMode = "OFFICE" | "WFH" | "FIELD";

export type ParsedEmployeeRow = {
  /** 1-based line number in the source, for error messages. */
  line: number;
  name: string;
  email: string;
  workMode: WorkMode;
  homeLatitude?: number;
  homeLongitude?: number;
  homeRadiusMeters?: number;
  /** Human-readable problems; empty means the row is good to submit. */
  problems: string[];
};

export const MAX_BULK_ROWS = 500;

export const TEMPLATE_HEADER = ["Name", "Email", "WorkMode", "HomeLatitude", "HomeLongitude", "HomeRadius"];

export const TEMPLATE_ROWS: string[][] = [
  ["Priya Sharma", "priya@acme.com", "OFFICE", "", "", ""],
  ["Arun Kumar", "arun@acme.com", "WFH", "12.9716", "77.5946", "75"],
  ["Neha Gupta", "neha@acme.com", "FIELD", "", "", ""],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Picks comma, tab or semicolon by whichever appears most on the first non-empty line. */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: [string, number][] = [
    [",", (first.match(/,/g) ?? []).length],
    ["\t", (first.match(/\t/g) ?? []).length],
    [";", (first.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Minimal RFC-4180-style parser: quoted fields, "" escapes, CRLF/LF, blank lines skipped. */
export function parseDelimited(input: string): { cells: string[]; line: number }[] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim().length > 0)) rows.push({ cells: row, line: rowStartLine });
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\r") {
      // swallowed; the following \n (if any) ends the row
    } else if (ch === "\n") {
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

function toNumber(raw: string | undefined): number | undefined | "invalid" {
  const v = raw?.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

/** True when a row looks like a header ("Name", "Email", ...) rather than data. */
function looksLikeHeader(cells: string[]): boolean {
  const a = cells[0]?.trim().toLowerCase();
  const b = cells[1]?.trim().toLowerCase();
  return (a === "name" || a === "employee name" || a === "full name") && !!b && /e-?mail/.test(b);
}

export function parseEmployeeCsv(text: string): { rows: ParsedEmployeeRow[]; tooMany: boolean } {
  const raw = parseDelimited(text);
  const dataRows = raw.length > 0 && looksLikeHeader(raw[0].cells) ? raw.slice(1) : raw;

  const seen = new Map<string, number>();
  const rows: ParsedEmployeeRow[] = dataRows.slice(0, MAX_BULK_ROWS).map(({ cells, line }) => {
    const problems: string[] = [];
    const name = (cells[0] ?? "").trim();
    const email = (cells[1] ?? "").trim().toLowerCase();
    const modeRaw = (cells[2] ?? "").trim().toUpperCase();
    const workMode: WorkMode = modeRaw === "" ? "OFFICE" : (modeRaw as WorkMode);

    if (!name) problems.push("Name is missing");
    if (!email) problems.push("Email is missing");
    else if (!EMAIL_RE.test(email)) problems.push("Email looks invalid");
    if (!["OFFICE", "WFH", "FIELD"].includes(workMode)) problems.push("WorkMode must be OFFICE, WFH or FIELD");

    const lat = toNumber(cells[3]);
    const lng = toNumber(cells[4]);
    const radius = toNumber(cells[5]);
    if (lat === "invalid" || (typeof lat === "number" && (lat < -90 || lat > 90))) problems.push("Latitude must be between -90 and 90");
    if (lng === "invalid" || (typeof lng === "number" && (lng < -180 || lng > 180))) problems.push("Longitude must be between -180 and 180");
    if (radius === "invalid" || (typeof radius === "number" && (radius < 1 || radius > 100_000))) problems.push("Radius must be a number of meters (1-100000)");
    if (workMode === "WFH" && (lat === undefined || lng === undefined)) problems.push("WFH needs HomeLatitude and HomeLongitude");

    if (email && EMAIL_RE.test(email)) {
      const firstLine = seen.get(email);
      if (firstLine !== undefined) problems.push(`Duplicate email (also on line ${firstLine})`);
      else seen.set(email, line);
    }

    return {
      line,
      name,
      email,
      workMode,
      homeLatitude: typeof lat === "number" ? lat : undefined,
      homeLongitude: typeof lng === "number" ? lng : undefined,
      homeRadiusMeters: typeof radius === "number" ? radius : undefined,
      problems,
    };
  });

  return { rows, tooMany: dataRows.length > MAX_BULK_ROWS };
}

/** CSV text for the downloadable template. */
export function templateCsv(): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
