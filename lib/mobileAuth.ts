import { SignJWT, jwtVerify } from "jose";

// Reuses the same secret NextAuth signs its own session JWTs with — no new
// env var, no schema changes. These tokens are otherwise unrelated to
// NextAuth's own session cookies (different claims, verified independently).
function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
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

/** Verifies the `Authorization: Bearer <token>` header of a mobile API request. */
export async function requireMobileUser(req: Request): Promise<MobileTokenPayload | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  return verifyMobileToken(token, "access");
}
