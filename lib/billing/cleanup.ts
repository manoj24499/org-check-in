import { prisma } from "@/lib/prisma";

// A CANCELLED/expired-PENDING checkout is scratch state — nothing about it
// is a real purchase, and once its hold has long since lapsed there's no
// reason to keep it. 30 days gives ample room to debug a recent abandoned
// checkout by hand before it's gone.
const CANCELLED_CHECKOUT_PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;
// Same 30-day window for spent tokens (used or simply expired unused) —
// see the schema comment on UserToken.
const USED_TOKEN_PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;
// PaymentEvent exists purely for webhook dedupe/audit, not billing history
// — a much longer retention is fine to keep since rows are small and
// carry no payment detail (see the schema comment on PaymentEvent).
const PAYMENT_EVENT_PRUNE_AFTER_MS = 180 * 24 * 60 * 60_000;

export type BillingPruneResult = {
  signupCheckouts: number;
  planChangeCheckouts: number;
  userTokens: number;
  paymentEvents: number;
};

/**
 * Best-effort daily pruning for the paid-signup and plan-change tables (see
 * instrumentation.ts's tick(), same pattern as lib/refreshTokenCleanup.ts
 * and lib/employeeCleanup.ts). Deliberately never touches a PROVISIONED/
 * APPLIED or NEEDS_ATTENTION row of either — those are a real purchase
 * record, or something a human still needs to resolve, not scratch state to
 * sweep.
 */
export async function pruneBillingRecords(): Promise<BillingPruneResult> {
  const checkoutCutoff = new Date(Date.now() - CANCELLED_CHECKOUT_PRUNE_AFTER_MS);
  const { count: signupCheckouts } = await prisma.signupCheckout.deleteMany({
    where: {
      status: { in: ["PENDING", "CANCELLED"] },
      holdExpiresAt: { lt: checkoutCutoff },
    },
  });
  const { count: planChangeCheckouts } = await prisma.planChangeCheckout.deleteMany({
    where: {
      status: { in: ["PENDING", "CANCELLED"] },
      holdExpiresAt: { lt: checkoutCutoff },
    },
  });

  const tokenCutoff = new Date(Date.now() - USED_TOKEN_PRUNE_AFTER_MS);
  const { count: userTokens } = await prisma.userToken.deleteMany({
    where: {
      OR: [{ usedAt: { not: null, lt: tokenCutoff } }, { expiresAt: { lt: tokenCutoff } }],
    },
  });

  const eventCutoff = new Date(Date.now() - PAYMENT_EVENT_PRUNE_AFTER_MS);
  const { count: paymentEvents } = await prisma.paymentEvent.deleteMany({
    where: { receivedAt: { lt: eventCutoff } },
  });

  return { signupCheckouts, planChangeCheckouts, userTokens, paymentEvents };
}
