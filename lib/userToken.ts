import crypto from "crypto";
import type { Prisma, UserTokenPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// `typeof prisma`, not the generic `PrismaClient` — the exported singleton
// has a branded type (its `omit` config, see lib/prisma.ts), which the bare
// `PrismaClient` type from "@prisma/client" isn't assignable from.
type Db = typeof prisma | Prisma.TransactionClient;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a new single-use token and returns the raw value — only its hash
 * is ever persisted (see the schema comment on UserToken). Invalidates any
 * earlier unused token of the same purpose for this user first, so a
 * re-sent activation link can't leave a still-valid older one lying around.
 */
export async function issueUserToken(
  db: Db,
  userId: string,
  purpose: UserTokenPurpose,
  ttlMs: number,
): Promise<string> {
  await db.userToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = crypto.randomBytes(32).toString("base64url");
  await db.userToken.create({
    data: { userId, purpose, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}

export type PeekResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Read-only check — must NEVER consume the token. Email clients and
 * security scanners prefetch links, so rendering the activation page (which
 * calls this) has to be side-effect free; only consumeUserToken, called
 * from the actual form submission, may mark a token used.
 */
export async function peekUserToken(raw: string, purpose: UserTokenPurpose): Promise<PeekResult> {
  const token = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!token || token.purpose !== purpose) return { ok: false, reason: "invalid" };
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  return { ok: true, userId: token.userId };
}

/**
 * Atomically consumes a token — a single conditional UPDATE requiring
 * exactly one row affected, so two concurrent submissions of the same link
 * can't both succeed. Takes a transaction client so the caller can set
 * whatever the token unlocks (e.g. passwordHash) in the same transaction.
 */
export async function consumeUserToken(
  tx: Prisma.TransactionClient,
  raw: string,
  purpose: UserTokenPurpose,
): Promise<string | null> {
  const tokenHash = hashToken(raw);
  const result = await tx.userToken.updateMany({
    where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (result.count !== 1) return null;

  const token = await tx.userToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return token?.userId ?? null;
}
