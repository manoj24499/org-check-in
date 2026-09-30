import crypto from "crypto";
import type {
  PaymentGateway,
  CreateCheckoutInput,
  NormalizedEvent,
  RetrieveCheckoutResult,
} from "../gateway";
import { isProductionRuntime } from "@/lib/isProduction";

/**
 * Dev-only stand-in for a real payment gateway (see lib/billing/gateway.ts)
 * — lets every phase up through provisioning be built and tested before
 * Razorpay/Stripe is chosen. `createCheckout` redirects to a "simulate
 * success/failure" page at `/signup/dev-pay` instead of a real hosted
 * checkout; those buttons POST an HMAC-signed fake event to the real
 * webhook route, exercising the exact same signature-verification and
 * provisioning path a real gateway's webhook would.
 *
 * That simulator page lives on whichever app the caller's own successUrl
 * points at — the marketing site for a brand-new org's signup (it now owns
 * that whole journey end-to-end, see lib/cors.ts), or this app itself for a
 * signed-in admin's plan change (see app/plans/). A real gateway would
 * redirect to its own hosted page regardless of who's calling; deriving the
 * origin from successUrl is this adapter's equivalent — it never needs to
 * know which caller it's serving.
 */

const FAKE_WEBHOOK_SECRET = process.env.FAKE_WEBHOOK_SECRET || "dev-only-insecure-fake-secret";

export function signFakePayload(payload: string): string {
  return crypto.createHmac("sha256", FAKE_WEBHOOK_SECRET).update(payload).digest("hex");
}

export function verifyFakeSignature(payload: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = signFakePayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type FakeWebhookBody = {
  eventId: string;
  type: "succeeded" | "failed";
  providerCheckoutId: string;
  amountPaise: number;
  currency: string;
};

// Defense-in-depth alongside lib/billing/gateway.ts's own (stronger)
// guard — even if getGateway() were ever bypassed and this adapter reached
// directly, it still refuses to do anything in production on its own.
function assertNotProduction() {
  if (isProductionRuntime()) {
    throw new Error("The fake payment adapter must never run in production.");
  }
}

export const fakeGateway: PaymentGateway = {
  id: "fake",

  async createCheckout(input: CreateCheckoutInput) {
    assertNotProduction();
    const providerCheckoutId = `fake_${crypto.randomUUID()}`;
    const params = new URLSearchParams({
      ref: input.ref,
      checkoutId: providerCheckoutId,
      amount: String(input.amountPaise),
      currency: input.currency,
      // Threaded through so this one simulator page can hand off to
      // whichever real page started the checkout (new-signup vs a signed-in
      // admin's plan change) — a real gateway would redirect to these same
      // URLs itself, so the fake adapter mirrors that instead of hardcoding
      // one caller's success page.
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    const simulatorOrigin = new URL(input.successUrl).origin;
    return {
      providerCheckoutId,
      handoff: { kind: "redirect", url: `${simulatorOrigin}/signup/dev-pay?${params.toString()}` },
    };
  },

  async verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent> {
    assertNotProduction();
    if (!verifyFakeSignature(rawBody, headers.get("x-fake-signature"))) {
      throw new Error("Invalid fake webhook signature.");
    }
    const body = JSON.parse(rawBody) as FakeWebhookBody;
    if (body.type === "succeeded") {
      return {
        eventId: body.eventId,
        type: "payment_succeeded",
        providerCheckoutId: body.providerCheckoutId,
        providerPaymentId: `fake_pay_${body.providerCheckoutId}`,
        providerCustomerId: `fake_cust_${body.providerCheckoutId}`,
        amountPaise: body.amountPaise,
        currency: body.currency,
      };
    }
    return {
      eventId: body.eventId,
      type: "payment_failed",
      providerCheckoutId: body.providerCheckoutId,
      failureReason: "simulated_failure",
    };
  },

  // The fake adapter has no independent ledger of its own — a checkout's
  // state only ever changes via the webhook the dev-pay page fires. This
  // always reporting "pending" is a known, documented limitation: the
  // webhook-driven path (Phase 7) is what's actually exercised against
  // this adapter; the polling-backup path is only meaningfully tested once
  // a real gateway (Phase 9) exists with its own real state to retrieve.
  async retrieveCheckout(): Promise<RetrieveCheckoutResult> {
    assertNotProduction();
    return { state: "pending" };
  },
};
