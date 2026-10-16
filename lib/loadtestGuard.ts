import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// A secret shorter than this is treated as "not set", so a placeholder like "test" cannot switch the probes on.
const MIN_SECRET_LENGTH = 16;

/** The load-test probes exist only while LOADTEST_SECRET is set to a long value. Unset it to switch them off. */
export function loadtestEnabled(): boolean {
  const secret = process.env.LOADTEST_SECRET;
  return Boolean(secret) && (secret as string).length >= MIN_SECRET_LENGTH;
}

/**
 * Returns an error response when the caller may not use the probes, or null when it may. While the probes are
 * switched off the route answers 404 as if it did not exist; once on, every request must carry the secret in
 * the `x-loadtest-secret` header.
 */
export function checkLoadtestAccess(req: Request): NextResponse | null {
  if (!loadtestEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const expected = Buffer.from(process.env.LOADTEST_SECRET as string);
  const given = Buffer.from(req.headers.get("x-loadtest-secret") ?? "");
  const ok = given.length === expected.length && timingSafeEqual(given, expected);
  return ok ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const inFlight = new Map<string, number>();

/**
 * Runs `fn` unless `max` calls of the same probe are already running, in which case it returns "busy" at once.
 * A load tool can then push the server until it says no, instead of queueing requests until the whole app
 * (and the database's small connection pool) stalls for everyone else.
 */
export async function runLimited<T>(probe: string, max: number, fn: () => Promise<T>): Promise<T | "busy"> {
  const current = inFlight.get(probe) ?? 0;
  if (current >= max) return "busy";
  inFlight.set(probe, current + 1);
  try {
    return await fn();
  } finally {
    inFlight.set(probe, (inFlight.get(probe) ?? 1) - 1);
  }
}
