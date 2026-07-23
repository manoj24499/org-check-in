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
