/**
 * The one seam between "a paid signup" and "whichever payment gateway is
 * actually wired up" — every phase up to and including provisioning is
 * built and tested against the fake adapter (lib/billing/adapters/fake.ts)
 * so a real gateway (Razorpay/Stripe) can be dropped in later as its own
 * isolated phase, implementing exactly these three methods, with nothing
 * else in the checkout/webhook/provisioning code needing to change.
 */

import { fakeGateway } from "./adapters/fake";
import { isProductionRuntime } from "@/lib/isProduction";

export type CheckoutHandoff =
  // Stripe Checkout-style: the browser is redirected to a gateway-hosted page.
  | { kind: "redirect"; url: string }
  // Razorpay Standard Checkout-style: the browser opens a client-side modal
  // using these params — genuinely different shape from a redirect, which
  // is why this is a discriminated union rather than always a URL.
  | { kind: "client_widget"; params: Record<string, unknown> };

export type NormalizedEvent = {
  eventId: string;
  type: "payment_succeeded" | "payment_failed" | "ignored";
  providerCheckoutId?: string;
  providerPaymentId?: string;
  providerCustomerId?: string;
  amountPaise?: number;
  currency?: string;
  failureReason?: string;
};

export type CreateCheckoutInput = {
  // SignupCheckout.publicRef — never the row's own id (see that model's
  // own comment on why).
  ref: string;
  amountPaise: number;
  currency: string;
  description: string;
  customer: { name: string; email: string };
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type RetrieveCheckoutResult = {
  state: "paid" | "pending" | "failed";
  providerPaymentId?: string;
  providerCustomerId?: string;
  amountPaise?: number;
  currency?: string;
};

export interface PaymentGateway {
  id: string;
  createCheckout(
    input: CreateCheckoutInput,
  ): Promise<{ providerCheckoutId: string; handoff: CheckoutHandoff }>;
  /** Throws on a bad/missing signature — callers treat that as a 400. */
  verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent>;
  /** Backup path for a slow/missing webhook (see /api/signup/status). */
  retrieveCheckout(providerCheckoutId: string): Promise<RetrieveCheckoutResult>;
}

/**
 * The production guard lives HERE, not only inside lib/billing/adapters/
 * fake.ts's own methods — a security review flagged that relying purely on
 * each adapter method independently self-checking is fragile (a future
 * edit to fake.ts could drop one of those checks and silently reopen this).
 * This is the one place BILLING_PROVIDER is read, so it's the one place
 * that can make "fake gateway in production" structurally impossible
 * rather than merely unlikely — an unset/misconfigured BILLING_PROVIDER in
 * production fails loudly here instead of silently defaulting to a gateway
 * anyone could forge a webhook signature for.
 */
export function getGateway(): PaymentGateway {
  const provider = process.env.BILLING_PROVIDER ?? "fake";
  if (provider === "fake") {
    if (isProductionRuntime()) {
      throw new Error(
        "BILLING_PROVIDER is \"fake\" (or unset) in production — refusing to use a gateway anyone could forge a payment confirmation for. Set a real BILLING_PROVIDER before deploying.",
      );
    }
    return fakeGateway;
  }
  throw new Error(`Unknown BILLING_PROVIDER: "${provider}"`);
}
