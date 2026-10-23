import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Per-session secret for location uploads. Made at check-in and returned to the caller once;
 * only its hash is stored, so a database leak can't be replayed against /api/kiosk/location.
 */
export function newTrackingToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashTrackingToken(token) };
}

export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a presented token against the stored hash. */
export function trackingTokenMatches(presented: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!presented || !storedHash) return false;
  const a = Buffer.from(hashTrackingToken(presented), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
