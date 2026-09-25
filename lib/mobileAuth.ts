import { randomUUID } from "crypto";
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
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type TokenType = "access" | "refresh";

export type MobileTokenPayload = {
  sub: string;
  employeeCode: string;
  role: "ADMIN" | "EMPLOYEE";
  type: TokenType;
  tokenVersion: number;
  // Only ever present on refresh tokens (see issueRefreshToken) — the id of
  // this token's own RefreshToken row, used for real server-side revocation
  // (logout, rotation). Access tokens carry no jti; they're short-lived
  // enough (15m) that tokenVersion/active-account checks already cover
  // them, per requireMobileUser's own comment.
  jti?: string;
};

type TokenSubject = {
  id: string;
  employeeCode: string;
  role: string;
  tokenVersion: number;
};

async function sign(user: TokenSubject, type: TokenType, ttl: string, jti?: string) {
  const builder = new SignJWT({ employeeCode: user.employeeCode, role: user.role, type, tokenVersion: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ttl);
  if (jti) builder.setJti(jti);
  return builder.sign(secretKey());
}

export function signAccessToken(user: TokenSubject) {
  return sign(user, "access", ACCESS_TOKEN_TTL);
}

/**
 * Signs a refresh token AND persists a matching RefreshToken row in one
 * call — this is the only way a refresh token should ever be minted, since
 * real revocation (logout, rotation) depends on every issued refresh token
 * having a corresponding row. See the schema comment on RefreshToken.
 */
export async function issueRefreshToken(user: TokenSubject): Promise<string> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const [token] = await Promise.all([
    sign(user, "refresh", REFRESH_TOKEN_TTL, jti),
    prisma.refreshToken.create({ data: { jti, userId: user.id, expiresAt } }),
  ]);
  return token;
}

/**
 * Atomically checks a refresh token's row is still valid (not revoked, not
 * past its own expiresAt) AND revokes it, in one UPDATE — used by
 * /api/mobile/refresh to claim a token for rotation. Deliberately not a
 * separate "check" step followed later by a separate "revoke" call: two
 * concurrent refresh requests carrying the same still-valid token would
 * otherwise both pass an initial read-only check before either commits its
 * revoke, and both would go on to mint their own new token pair — a real
 * TOCTOU race that both double-issues sessions from one token and silently
 * defeats reuse detection (a captured, not-yet-rotated token replayed at
 * the same moment as the legitimate device's own routine refresh would
 * succeed for both, with nothing to flag it as suspicious). Returns true
 * only for whichever single caller actually wins the race — every other
 * concurrent caller (including a genuine replay) gets `false` and must log
 * in again. A token signed before this feature existed carries no `jti`
 * claim at all and is rejected here, forcing one extra login for an
 * already-logged-in device the first time it refreshes after this
 * deploys — a deliberate one-time cost for real revocation, not a bug.
 */
export async function claimRefreshToken(jti: string): Promise<boolean> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { jti, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date() },
  });
  return count === 1;
}

/**
 * Bulk-revokes every currently-active RefreshToken row for a user — called
 * alongside a `tokenVersion` bump (both change-pin routes) so the
 * RefreshToken table's own `revokedAt` doesn't silently drift out of sync
 * with what `tokenVersion` already implies. Without this, a PIN change
 * left every other outstanding session's RefreshToken row reporting
 * `revokedAt: null` — not currently exploitable (verifyMobileToken/
 * tokenVersionMatches still independently reject those tokens on their own
 * next refresh), but a real trap for anything built later that reads
 * RefreshToken.revokedAt as the source of truth (an "active sessions" admin
 * view, say) without also re-checking tokenVersion.
 */
export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Marks one specific refresh token's row revoked — used by logout to
 * revoke just that one session. (Rotation in /api/mobile/refresh uses
 * claimRefreshToken instead, which checks-and-revokes atomically — see its
 * own comment for why a separate check-then-call-this pattern there was a
 * real race.) Idempotent: revoking an already-revoked or nonexistent jti is
 * a harmless no-op. */
export async function revokeRefreshToken(jti: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { jti, revokedAt: null }, data: { revokedAt: new Date() } });
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
export async function requireMobileUser(
  req: Request,
): Promise<(MobileTokenPayload & { organizationId: string }) | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  const payload = await verifyMobileToken(token, "access");
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { active: true, tokenVersion: true, organizationId: true },
  });
  if (!user?.active || !user.organizationId || !tokenVersionMatches(payload, user)) return null;

  return { ...payload, organizationId: user.organizationId };
}

export { tokenVersionMatches };
