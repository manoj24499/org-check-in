import { isRateLimited } from "@/lib/rateLimit";
import { resolvePartnerAuth } from "@/lib/partnerApi/auth";
import { partnerError } from "@/lib/partnerApi/response";

// "At least 60 requests per minute" per company (the contract's NFR) — set
// comfortably above that floor rather than exactly at it.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;

/** Wraps every /api/v1/* handler: resolves the Bearer key to an
 * organization, rate-limits per organization (not per IP — a partner's own
 * infrastructure may call from several IPs), and never lets an unexpected
 * throw leak an internal error message to an external caller. */
export async function withPartnerAuth(
  req: Request,
  handler: (organizationId: string) => Promise<Response>,
): Promise<Response> {
  const auth = await resolvePartnerAuth(req);
  if (!auth.ok) {
    return partnerError("UNAUTHORIZED", "The Authorization bearer token is missing, invalid, or has been revoked.");
  }

  const limited = await isRateLimited(`partner-api:${auth.organizationId}`, WINDOW_MS, MAX_PER_WINDOW);
  if (limited) {
    const res = partnerError("RATE_LIMITED", "Too many requests — try again shortly.");
    res.headers.set("Retry-After", "60");
    res.headers.set("X-RateLimit-Limit", String(MAX_PER_WINDOW));
    return res;
  }

  try {
    return await handler(auth.organizationId);
  } catch (err) {
    console.error("[partner-api] Unhandled error:", err);
    return partnerError("INTERNAL_ERROR", "Something went wrong on our side.");
  }
}
