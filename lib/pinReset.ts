import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";

/**
 * Admin-issued one-time PIN reset. The admin generates a short numeric code for an employee who forgot their
 * PIN (the employee's admin screen shows it once); the employee types it into the app, which swaps it for a
 * short-lived reset token, and that token lets them choose a new PIN. Nothing is emailed or texted.
 */

export const RESET_CODE_LENGTH = 6;
/** How long an admin-issued code stays usable. */
export const RESET_CODE_TTL_MS = 24 * 60 * 60 * 1000;
/** Wrong guesses before the code is thrown away and the admin has to issue a new one. */
export const RESET_CODE_MAX_ATTEMPTS = 5;
/** After a correct code, how long the employee has to finish choosing the new PIN. */
const RESET_TOKEN_TTL = "10m";

export function generateResetCode(): string {
  let code = "";
  for (let i = 0; i < RESET_CODE_LENGTH; i++) code += crypto.randomInt(0, 10);
  return code;
}

// Same secret as the mobile access tokens (a leak of one is a leak of the other anyway); the "pin-reset"
// type claim keeps a reset token from ever being accepted as an access or refresh token, and vice versa.
function secretKey() {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

/** The tail of the stored code hash is embedded so the token dies the moment that code is used or replaced. */
function codeTag(pinResetHash: string): string {
  return pinResetHash.slice(-16);
}

export function signResetToken(userId: string, pinResetHash: string) {
  return new SignJWT({ type: "pin-reset", rv: codeTag(pinResetHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(RESET_TOKEN_TTL)
    .sign(secretKey());
}

export async function verifyResetToken(token: string): Promise<{ userId: string; tag: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.type !== "pin-reset" || typeof payload.sub !== "string" || typeof payload.rv !== "string") return null;
    return { userId: payload.sub, tag: payload.rv };
  } catch {
    return null;
  }
}

export function resetTokenMatches(pinResetHash: string | null, tag: string): boolean {
  return !!pinResetHash && codeTag(pinResetHash) === tag;
}
