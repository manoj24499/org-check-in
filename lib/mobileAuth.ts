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
};

type TokenSubject = {
  id: string;
  employeeCode: string;
  role: string;
};

async function sign(user: TokenSubject, type: TokenType, ttl: string) {
  return new SignJWT({ employeeCode: user.employeeCode, role: user.role, type })
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
    return payload as unknown as MobileTokenPayload;
  } catch {
    return null;
  }
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

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { active: true } });
  if (!user?.active) return null;

  return payload;
}
