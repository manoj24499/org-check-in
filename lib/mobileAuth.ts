import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

// Deliberately its own secret, separate from AUTH_SECRET (which signs
// NextAuth's own web session JWTs) — previously the two were reused from the
// same value. Reusing one secret across two unrelated token systems means a
// single leak (a log line, a misconfigured env dump, a future accidental
// commit) forges both admin/employee web sessions *and* mobile access/
// refresh tokens for any user; separating them means a leak of one doesn't
// compromise the other. Generate with `openssl rand -base64 32`.
function secretKey() {
  const secret = process.env.MOBILE_JWT_SECRET;
  if (!secret) throw new Error("MOBILE_JWT_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";

type TokenType = "access" | "refresh";

export type MobileTokenPayload = {
  sub: string;
  employeeCode: string;
  role: "ADMIN" | "EMPLOYEE";
  type: TokenType;
  tokenVersion: number;
};

type TokenSubject = {
  id: string;
  employeeCode: string;
  role: string;
  tokenVersion: number;
};

async function sign(user: TokenSubject, type: TokenType, ttl: string) {
  return new SignJWT({ employeeCode: user.employeeCode, role: user.role, type, tokenVersion: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secretKey());
}

export function signAccessToken(user: TokenSubject) {
  return sign(user, "access", ACCESS_TOKEN_TTL);
}

export function signRefreshToken(user: TokenSubject) {
  return sign(user, "refresh", REFRESH_TOKEN_TTL);
}

export async function verifyMobileToken(
  token: string,
  expectedType: TokenType,
): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.type !== expectedType || typeof payload.sub !== "string") return null;
    // Tokens signed before tokenVersion existed carry no such claim — treat
    // that the same as version 0 (everyone's starting DB value), so this
    // change doesn't force-log-out every already-logged-in device on
    // deploy day.
    return { ...payload, tokenVersion: typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0 } as unknown as MobileTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Checks a verified token's tokenVersion claim against the account's
 * current one — bumped by /api/mobile/change-pin so a stolen token pair
 * can't outlive the legitimate employee changing their PIN (see the schema
 * comment on User.tokenVersion). The JWT signature/expiry alone only proves
 * the token was validly issued, not that it hasn't since been superseded.
 */
function tokenVersionMatches(payload: MobileTokenPayload, user: { tokenVersion: number }): boolean {
  return payload.tokenVersion === user.tokenVersion;
}

/**
 * Verifies the `Authorization: Bearer <token>` header of a mobile API
 * request. Also re-checks the account is still active in the database —
 * the JWT signature/expiry alone only proves the token was validly issued,
 * not that the account is still allowed to use it *right now*. Without
 * this, deactivating an employee (offboarding, a suspected compromised
 * device) wouldn't take effect on most mobile routes for up to the access
 * token's full 15-minute lifetime. Centralized here, rather than repeated
 * per-route, so every current and future caller of requireMobileUser gets
 * it automatically instead of relying on each route remembering to check.
 */
export async function requireMobileUser(req: Request): Promise<MobileTokenPayload | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  const payload = await verifyMobileToken(token, "access");
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { active: true, tokenVersion: true } });
  if (!user?.active || !tokenVersionMatches(payload, user)) return null;

  return payload;
}

export { tokenVersionMatches };
