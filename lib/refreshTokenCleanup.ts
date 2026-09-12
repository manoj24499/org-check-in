import { prisma } from "@/lib/prisma";

// Nothing else ever deletes a RefreshToken row — every login/refresh/
// change-pin adds one, and rotation/logout only ever set revokedAt, never
// remove the row — so without this the table grows forever. Pruned a week
// past each row's own expiresAt (not right at it) so there's no risk of
// deleting a row a concurrent /api/mobile/refresh request is still
// mid-way through validating.
const PRUNE_AFTER_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function pruneExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - PRUNE_AFTER_EXPIRY_MS);
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return count;
}
