import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { computeQuote, isQuoteError, type Quote } from "@/lib/billing/quote";
import { getGateway, type CheckoutHandoff } from "@/lib/billing/gateway";
import { APP_BASE_URL } from "@/lib/appUrl";

const HOLD_DURATION_MS = 45 * 60_000;

function sendOpsAlert(message: string) {
  console.error(`[ops-alert] ${message}`);
}

export type CreatePlanChangeResult =
  | { ok: true; ref: string; amountPaise: number; currency: string; quote: Quote; handoff: CheckoutHandoff }
  | { ok: false; error: string; field?: "plan" | "cycle" | "seats" };

/**
 * Starts a self-serve plan change for an EXISTING organization — mirrors
 * app/api/signup/checkout/route.ts's own createCheckout call, but there's no
 * slug/email hold to check (the organization already exists and already has
 * exactly the admin who's requesting this) and nothing is provisioned here;
 * only applyPlanChange, once payment is confirmed, ever touches the
 * Organization row.
 */
export async function createPlanChangeCheckout(params: {
  organizationId: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedByEmail: string;
  planId: string;
  cycle: string;
  seats: number;
  ip: string | null;
}): Promise<CreatePlanChangeResult> {
  const quote = computeQuote(params.planId, params.cycle, params.seats);
  if (isQuoteError(quote)) {
    return { ok: false, error: quote.error, field: quote.field };
  }

  const gateway = getGateway();
  const publicRef = crypto.randomBytes(16).toString("base64url");
  const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

  const checkout = await prisma.planChangeCheckout.create({
    data: {
      publicRef,
      organizationId: params.organizationId,
      requestedByUserId: params.requestedByUserId,
      planId: quote.planId,
      billingCycle: quote.billingCycle,
      seats: quote.seats,
      pricePerSeatPaise: quote.pricePerSeatPaise,
      subtotalPaise: quote.subtotalPaise,
      taxPaise: quote.taxPaise,
      amountPaise: quote.amountPaise,
      currency: quote.currency,
      pricingVersion: quote.pricingVersion,
      provider: gateway.id,
      holdExpiresAt,
      createdIp: params.ip,
    },
  });

  try {
    const { providerCheckoutId, handoff } = await gateway.createCheckout({
      ref: checkout.publicRef,
      amountPaise: quote.amountPaise,
      currency: quote.currency,
      description: `Inzivo plan change — ${quote.planId} plan, ${quote.seats} seats (${quote.billingCycle})`,
      customer: { name: params.requestedByName, email: params.requestedByEmail },
      successUrl: `${APP_BASE_URL}/plans/complete?ref=${checkout.publicRef}`,
      cancelUrl: `${APP_BASE_URL}/plans/complete?ref=${checkout.publicRef}&cancelled=1`,
      expiresAt: holdExpiresAt,
    });

    await prisma.planChangeCheckout.update({ where: { id: checkout.id }, data: { providerCheckoutId } });

    return { ok: true, ref: checkout.publicRef, amountPaise: quote.amountPaise, currency: quote.currency, quote, handoff };
  } catch (err) {
    console.error("[planChange] Gateway error:", err);
    await prisma.planChangeCheckout.update({ where: { id: checkout.id }, data: { status: "CANCELLED" } });
    return { ok: false, error: "Could not start checkout. Please try again." };
  }
}

export type ApplyPlanChangeOutcome =
  | { outcome: "applied"; organizationId: string; planId: string; seats: number }
  | { outcome: "duplicate" }
  | { outcome: "needs_attention"; reason: string };

/**
 * The one idempotent function that turns a confirmed plan-change payment
 * into an updated Organization — shared by the webhook (app/api/billing/
 * webhook/route.ts) and the status-poll fallback (app/api/plan-change/
 * status/route.ts), same split as lib/billing/provision.ts's identical
 * pattern for a brand-new signup.
 */
export async function applyPlanChange(
  checkoutId: string,
  payment: { providerPaymentId: string; providerCustomerId?: string; amountPaise: number; currency: string },
): Promise<ApplyPlanChangeOutcome> {
  const checkout = await prisma.planChangeCheckout.findUnique({ where: { id: checkoutId } });
  if (!checkout) {
    sendOpsAlert(`applyPlanChange called with unknown checkout id ${checkoutId}`);
    return { outcome: "needs_attention", reason: "checkout_not_found" };
  }
  if (checkout.status === "APPLIED") {
    return { outcome: "duplicate" };
  }
  if (checkout.status === "NEEDS_ATTENTION") {
    return { outcome: "needs_attention", reason: checkout.attentionReason ?? "unknown" };
  }

  // Same integrity check as provisionPaidSignup — never trust the caller's
  // amount/currency over the server-computed quote frozen at checkout time.
  if (payment.amountPaise !== checkout.amountPaise || payment.currency !== checkout.currency) {
    await prisma.planChangeCheckout.update({
      where: { id: checkout.id },
      data: { status: "NEEDS_ATTENTION", attentionReason: "amount_mismatch" },
    });
    sendOpsAlert(
      `Amount mismatch for plan-change ${checkout.publicRef}: expected ${checkout.amountPaise} ${checkout.currency}, got ${payment.amountPaise} ${payment.currency}`,
    );
    return { outcome: "needs_attention", reason: "amount_mismatch" };
  }

  const claim = await prisma.planChangeCheckout.updateMany({
    // PENDING or CANCELLED, same as provisionPaidSignup's identical claim —
    // a recorded failed attempt (see the webhook's payment_failed handling
    // below) still leaves the checkout retryable on the same order.
    where: { id: checkout.id, status: { in: ["PENDING", "CANCELLED"] } },
    data: { status: "APPLIED", paidAt: new Date(), appliedAt: new Date(), providerPaymentId: payment.providerPaymentId },
  });
  if (claim.count !== 1) {
    // Lost the race to a concurrent call (or a duplicate delivery) — not an
    // error, same as the identical race in provisionPaidSignup.
    return { outcome: "duplicate" };
  }

  const organization = await prisma.organization.update({
    where: { id: checkout.organizationId },
    data: {
      planTier: checkout.planId,
      seatLimit: checkout.seats,
      ...(payment.providerCustomerId ? { billingCustomerId: payment.providerCustomerId } : {}),
    },
  });

  return { outcome: "applied", organizationId: organization.id, planId: checkout.planId, seats: checkout.seats };
}
