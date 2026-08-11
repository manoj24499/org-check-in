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
