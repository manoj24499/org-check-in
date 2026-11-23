import { prisma } from "@/lib/prisma";

// An admin's sign-in lasts up to 30 days and nothing on the server remembered it, so changing the password left
// every other browser signed in. User.passwordChangedAt fixes that: a sign-in made before it is no longer valid.
// This runs whenever a session is read, so the last answer is kept for a short time per user instead of asking the
// database on every request. Other admins are signed out within this long of the change.
const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; changedAt: number | null }>();

/** True when this admin's password was changed or reset after the sign-in `signedInAt` (ms). */
export async function isAdminSessionStale(userId: string, signedInAt: number | undefined): Promise<boolean> {
  let entry = cache.get(userId);
  if (!entry || Date.now() - entry.at > CACHE_MS) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordChangedAt: true } });
    entry = { at: Date.now(), changedAt: user?.passwordChangedAt?.getTime() ?? null };
    cache.set(userId, entry);
  }
  // A sign-in from before this feature has no timestamp, so it counts as older than any change.
  return entry.changedAt !== null && (signedInAt ?? 0) < entry.changedAt;
}

/** Drops the remembered answer so a change takes effect at once on this server. */
export function forgetPasswordChange(userId: string): void {
  cache.delete(userId);
}
