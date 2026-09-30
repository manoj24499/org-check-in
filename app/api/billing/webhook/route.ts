import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGateway } from "@/lib/billing/gateway";
import { provisionPaidSignup } from "@/lib/billing/provision";
import { applyPlanChange } from "@/lib/billing/planChange";

/**
 * Inbound payment-gateway webhook — the source of truth for confirming a
 * paid signup (see /api/signup/status for the polling backup when a
 * webhook is slow or never arrives, e.g. in local dev without a tunnel).
 *
 * No rate limiting here deliberately: gateway traffic comes from shared
 * infrastructure IPs, and throttling it would drop real retries. The
 * signature check is the actual guard against abuse.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/billing/webhook] Unhandled error:", err);
    // 5xx here is deliberate (unlike every other route in this app) — an
    // unexpected failure (e.g. the database being briefly unreachable)
    // should make the gateway retry, not treat this delivery as handled.
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  // Raw text, read before anything else — signature verification needs
  // the exact bytes, not a re-serialized JSON.parse/stringify round-trip.
  const rawBody = await req.text();
  const gateway = getGateway();

  let event;
  try {
    event = await gateway.verifyAndParseWebhook(rawBody, req.headers);
  } catch (err) {
    console.error("[POST /api/billing/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency layer 1: (provider, eventId) is unique — a duplicate
  // delivery of an event we've already recorded is a clean no-op.
  try {
    await prisma.paymentEvent.create({
      data: { provider: gateway.id, eventId: event.eventId, type: event.type },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw err;
  }

  if (event.type === "ignored") {
    return NextResponse.json({ ok: true });
  }
  if (!event.providerCheckoutId) {
    console.error("[POST /api/billing/webhook] Event missing providerCheckoutId:", event.eventId);
    return NextResponse.json({ ok: true });
  }

  // A providerCheckoutId belongs to exactly one of these two tables —
  // SignupCheckout for a brand-new org, PlanChangeCheckout for an existing
  // one's self-serve upgrade (see lib/billing/planChange.ts). Checked in
  // this order only because SignupCheckout existed first; there's no
  // meaningful precedence between them.
  const signupCheckout = await prisma.signupCheckout.findUnique({
    where: { providerCheckoutId: event.providerCheckoutId },
  });
  const planChangeCheckout = signupCheckout
    ? null
    : await prisma.planChangeCheckout.findUnique({ where: { providerCheckoutId: event.providerCheckoutId } });

  if (!signupCheckout && !planChangeCheckout) {
    console.error("[POST /api/billing/webhook] No checkout for providerCheckoutId:", event.providerCheckoutId);
    return NextResponse.json({ ok: true });
  }

  if (event.type === "payment_failed") {
    // Doesn't end the checkout — some gateways send a failed attempt
    // followed by a successful retry on the same order (see
    // lib/billing/provision.ts and the row's own holdExpiresAt for when
    // it actually stops being retryable).
    if (signupCheckout) {
      await prisma.signupCheckout.update({
        where: { id: signupCheckout.id },
        data: { lastPaymentError: event.failureReason ?? "payment_failed" },
      });
    } else {
      await prisma.planChangeCheckout.update({
        where: { id: planChangeCheckout!.id },
        data: { lastPaymentError: event.failureReason ?? "payment_failed" },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // payment_succeeded
  if (!event.providerPaymentId || event.amountPaise === undefined || !event.currency) {
    console.error("[POST /api/billing/webhook] Succeeded event missing required fields:", event.eventId);
    return NextResponse.json({ ok: true });
  }

  const payment = {
    providerPaymentId: event.providerPaymentId,
    providerCustomerId: event.providerCustomerId,
    amountPaise: event.amountPaise,
    currency: event.currency,
  };
  const outcome = signupCheckout
    ? await provisionPaidSignup(signupCheckout.id, payment)
    : await applyPlanChange(planChangeCheckout!.id, payment);

  await prisma.paymentEvent
    .updateMany({
      where: { provider: gateway.id, eventId: event.eventId },
      data: { outcome: outcome.outcome, providerCheckoutId: event.providerCheckoutId },
    })
    .catch(() => {
      // Observability only — never worth failing a successful provision over.
    });

  return NextResponse.json({ ok: true, outcome: outcome.outcome });
}
