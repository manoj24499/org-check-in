import { ipAddress } from "@vercel/functions";

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

// Simple in-memory rate limiter (per-process). Good enough for a single
// small kiosk device; swap for Upstash/Redis if you deploy multiple instances.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, windowMs = 60_000, max = 20): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
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

export function isPinGuessLimited(employeeCode: string): boolean {
  return isRateLimited(`pin-guess:${employeeCode}`, PIN_GUESS_WINDOW_MS, PIN_GUESS_MAX);
}
