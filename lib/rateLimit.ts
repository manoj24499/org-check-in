import { ipAddress } from "@vercel/functions";
import { prisma } from "@/lib/prisma";

/**
 * Resolves the caller's IP for use as a rate-limit key.
 *
 * `X-Forwarded-For` is a plain request header, so a caller can put anything in it. A reverse proxy such as
 * nginx (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`) does not replace what the caller
 * sent, it appends the address it actually saw on the right. So the left side is untrusted and only the
 * entries added by our own proxies can be believed. Reading the whole header, or its first entry, lets an
 * attacker get a fresh rate-limit bucket on every request just by changing the part they control.
 *
 * `TRUSTED_PROXY_HOPS` is how many proxies sit in front of the app (default 1, e.g. nginx): the address that
 * many entries from the right is the real client. On Vercel its own header is used instead, which Vercel
 * overwrites. Without any proxy the header is entirely caller-controlled, so keep the app behind one.
 */
export function getClientIp(request: Request): string {
  const vercel = ipAddress(request);
  if (vercel) return vercel;

  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  const entries = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (entries.length > 0) return entries[Math.max(0, entries.length - hops)];

  return request.headers.get("x-real-ip")?.trim() || "unknown";
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
// lib/auth.ts's employee-login provider) — keyed on organizationId +
// employeeCode, with no per-surface or per-IP component. Each of those
// surfaces also has its own IP-based limit (a first line of defense against
// one noisy source), but that's easily sidestepped by spreading guesses
// across IPs/proxies. This is the actual account-lockout guard for PIN
// brute force: without one shared bucket, an attacker exhausting one
// surface's limit could just switch to another and get a fresh budget for
// guessing the exact same underlying pinHash. organizationId is part of the
// key (not just employeeCode) so two different organizations' unrelated
// "EMP001" don't share one lockout bucket — every caller must resolve the
// organization before this check.
const PIN_GUESS_WINDOW_MS = 5 * 60_000;
const PIN_GUESS_MAX = 10;

// A second, slower budget on top of the 5-minute one: the short limit alone still allows about 2,900 guesses
// a day, which is enough to get through a 4-digit PIN in a few days. Capping a whole hour at 30 brings that
// down to about 700 a day, and a real person checking in and out never gets near it.
const PIN_GUESS_HOUR_WINDOW_MS = 60 * 60_000;
const PIN_GUESS_HOUR_MAX = 30;

export async function isPinGuessLimited(organizationId: string, employeeCode: string): Promise<boolean> {
  const who = `${organizationId}:${employeeCode}`;
  if (await isRateLimited(`pin-guess:${who}`, PIN_GUESS_WINDOW_MS, PIN_GUESS_MAX)) return true;
  return isRateLimited(`pin-guess-hour:${who}`, PIN_GUESS_HOUR_WINDOW_MS, PIN_GUESS_HOUR_MAX);
}
