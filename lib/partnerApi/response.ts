import crypto from "crypto";
import { NextResponse } from "next/server";

export type PartnerErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_FOR_CODE: Record<PartnerErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** The one error-body shape across every /api/v1/* route, matching the
 * Payroll team's contract — a first for this app (every other route here
 * returns its own ad hoc `{ error: "..." }` string; see the response doc's
 * Errors and limits section). */
export function partnerError(code: PartnerErrorCode, message: string, details?: Record<string, unknown>) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}), requestId: `req_${crypto.randomBytes(6).toString("hex")}` } },
    { status: STATUS_FOR_CODE[code] },
  );
}

export interface PageInfo {
  limit: number;
  nextCursor: string | null;
  totalCount: number;
}

/** The one list-response envelope every /api/v1/* GET returns. */
export function partnerList<T>(data: T[], page: PageInfo) {
  return NextResponse.json({ data, page, generatedAt: new Date().toISOString() });
}

export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): string | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

export function parseLimit(raw: string | null, fallback = 200, max = 1000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}
