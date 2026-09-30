import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ActiveHoldQuery = {
  slug?: string;
  email?: string;
  /** Excludes holds placed by this email — a person retrying checkout
   * against their own already-held slug isn't a conflict with themselves,
   * see the schema comment on SignupCheckout.holdExpiresAt. */
  excludeEmail?: string;
};

/**
 * A "hold" is a PENDING SignupCheckout whose 45-minute window hasn't
 * lapsed yet. Once it expires, the slug/email is simply free again —
 * nothing needs to be cleaned up for that alone (see
 * lib/billing/cleanup.ts, a later phase, for eventual row pruning, which
 * is unrelated to the hold itself).
 */
export async function findActiveHold(query: ActiveHoldQuery) {
  const { slug, email, excludeEmail } = query;
  const or: Prisma.SignupCheckoutWhereInput[] = [];
  if (slug) or.push({ slug });
  if (email) or.push({ adminEmail: email });
  if (or.length === 0) return null;

  return prisma.signupCheckout.findFirst({
    where: {
      status: "PENDING",
      holdExpiresAt: { gt: new Date() },
      OR: or,
      ...(excludeEmail ? { adminEmail: { not: excludeEmail } } : {}),
    },
    select: { id: true, slug: true, adminEmail: true },
  });
}
