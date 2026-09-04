import { ipAddress } from "@vercel/functions";
import { prisma } from "@/lib/prisma";

/**
 * Resolves the caller's IP for use as a rate-limit key. `X-Forwarded-For` is
 * a plain request header — anyone can set it to any value they like — so
 * reading it directly (as this code used to) lets an attacker get a fresh
 * rate-limit bucket on every request just by varying that header, fully
 * defeating the limit. `ipAddress()` reads Vercel's own edge-network
 * headers instead: Vercel overwrites those with the real connecting IP
 * before the request reaches this code, discarding whatever the client
 * sent, so it can't be spoofed in production. Falls back to the raw header
 * only when running outside Vercel (e.g. local `next dev`), where there's
 * no edge network to provide a trustworthy value and no production
 * spoofing risk to guard against.
 */
export function getClientIp(request: Request): string {
  return ipAddress(request) ?? request.headers.get("x-forwarded-for") ?? "unknown";
}

/**
 * Postgres-backed fixed-window rate limiter — one shared source of truth
 * regardless of how many concurrent instances of this app happen to be
 * running (see the schema comment on RateLimitBucket for why an in-memory
 * `Map` here wasn't actually safe to assume single-instance). One bucket
 * row per key, reset in place once its window has passed rather than
 * accumulating a new row per window.
 *
 * The increment-or-reset is a single atomic `INSERT ... ON CONFLICT DO
 * UPDATE`, so two concurrent callers racing on the same key still serialize
 * correctly at the database level (Postgres takes a row lock on the
 * conflicting key) instead of both reading a stale count and undercounting
 * — the exact failure mode a naive read-then-write "check, then increment"
 * would have.
 */
export async function isRateLimited(key: string, windowMs = 60_000, max = 20): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (key, count, "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitBucket"."resetAt" > ${now} THEN "RateLimitBucket".count + 1 ELSE 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" > ${now} THEN "RateLimitBucket"."resetAt" ELSE ${resetAt} END
    RETURNING count;
  `;
  return rows[0].count > max;
}

// Deliberately shared by every entry point that checks a PIN against an
// employeeCode — kiosk scan, mobile login, and the "My Page" web login (see
// lib/auth.ts's employee-login provider) — keyed on the employeeCode alone,
// with no per-surface or per-IP component. Each of those surfaces also has
// its own IP-based limit (a first line of defense against one noisy
// source), but that's easily sidestepped by spreading guesses across
// IPs/proxies. This is the actual account-lockout guard for PIN brute
// force: without one shared bucket, an attacker exhausting one surface's
// limit could just switch to another and get a fresh budget for guessing
// the exact same underlying pinHash.
const PIN_GUESS_WINDOW_MS = 5 * 60_000;
const PIN_GUESS_MAX = 10;

export function isPinGuessLimited(employeeCode: string): Promise<boolean> {
  return isRateLimited(`pin-guess:${employeeCode}`, PIN_GUESS_WINDOW_MS, PIN_GUESS_MAX);
}
