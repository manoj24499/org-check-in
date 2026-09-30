import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeOrgSlug, isValidOrgSlug } from "@/lib/orgSlug";
import { computeQuote, isQuoteError } from "@/lib/billing/quote";
import { findActiveHold } from "@/lib/billing/holds";
import { getGateway } from "@/lib/billing/gateway";
import { MARKETING_SITE_URL } from "@/lib/marketingSiteUrl";
import { withCors, corsPreflight } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

const bodySchema = z.object({
  plan: z.enum(["starter", "growth", "scale"]),
  cycle: z.enum(["monthly", "annual"]),
  seats: z.number().int(),
  organizationName: z.string().trim().min(1).max(120),
  slug: z.string().min(1),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  acceptTerms: z.literal(true),
});

const HOLD_DURATION_MS = 45 * 60_000;

/**
 * Starts a paid signup — creates the SignupCheckout holding record (see its
 * own schema comment on why this is never a pending Organization) and
 * starts a payment-gateway checkout for it. Nothing here provisions
 * anything; that only happens once payment is confirmed (see the future
 * lib/billing/provision.ts, driven by the webhook/status-poll routes).
 */
export async function POST(req: NextRequest) {
  try {
    return withCors(await handlePost(req));
  } catch (err) {
    console.error("[POST /api/signup/checkout] Unhandled error:", err);
    return withCors(NextResponse.json({ error: "Internal server error." }, { status: 500 }));
  }
}

async function handlePost(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`signup-checkout:ip:${ip}`, 60_000, 5)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { plan, cycle, seats, organizationName, adminName, adminEmail } = parsed.data;

  if (await isRateLimited(`signup-checkout:email:${adminEmail}`, 60 * 60_000, 5)) {
    return NextResponse.json(
      { error: "Too many attempts for this email. Please wait a while and try again." },
      { status: 429 },
    );
  }

  const slug = normalizeOrgSlug(parsed.data.slug);
  if (!isValidOrgSlug(slug)) {
    return NextResponse.json(
      {
        error: "Organization code must be 2-40 characters: lowercase letters, numbers, and hyphens only.",
        field: "slug",
      },
      { status: 400 },
    );
  }

  // Server-side quote, recomputed from lib/billing/plans.ts — a query-param
  // or client-typed price is never trusted, only used as editable pre-fill.
  const quote = computeQuote(plan, cycle, seats);
  if (isQuoteError(quote)) {
    return NextResponse.json({ error: quote.error, field: quote.field }, { status: 400 });
  }

  const [orgTaken, userTaken, slugHeld] = await Promise.all([
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } }),
    // Excludes this same email's own hold — a retry against the slug they
    // themselves are already holding isn't a conflict.
    findActiveHold({ slug, excludeEmail: adminEmail }),
  ]);
  if (orgTaken || slugHeld) {
    return NextResponse.json({ error: "That organization code is already taken.", field: "slug" }, { status: 409 });
  }
  if (userTaken) {
    return NextResponse.json(
      { error: "That email already has a workspace. Sign in instead.", field: "adminEmail" },
      { status: 409 },
    );
  }

  const gateway = getGateway();
  const publicRef = crypto.randomBytes(16).toString("base64url");
  const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

  const checkout = await prisma.signupCheckout.create({
    data: {
      publicRef,
      planId: quote.planId,
      billingCycle: quote.billingCycle,
      seats: quote.seats,
      pricePerSeatPaise: quote.pricePerSeatPaise,
      subtotalPaise: quote.subtotalPaise,
      taxPaise: quote.taxPaise,
      amountPaise: quote.amountPaise,
      currency: quote.currency,
      pricingVersion: quote.pricingVersion,
      organizationName,
      slug,
      adminName,
      adminEmail,
      provider: gateway.id,
      holdExpiresAt,
      createdIp: ip,
    },
  });

  try {
    const { providerCheckoutId, handoff } = await gateway.createCheckout({
      ref: checkout.publicRef,
      amountPaise: quote.amountPaise,
      currency: quote.currency,
      description: `Inzivo ${quote.planId} plan — ${quote.seats} seats (${quote.billingCycle})`,
      customer: { name: adminName, email: adminEmail },
      successUrl: `${MARKETING_SITE_URL}/signup/complete?ref=${checkout.publicRef}`,
      cancelUrl: `${MARKETING_SITE_URL}/signup/complete?ref=${checkout.publicRef}&cancelled=1`,
      expiresAt: holdExpiresAt,
    });

    await prisma.signupCheckout.update({
      where: { id: checkout.id },
      data: { providerCheckoutId },
    });

    return NextResponse.json({
      ref: checkout.publicRef,
      amountPaise: quote.amountPaise,
      currency: quote.currency,
      quote,
      handoff,
    });
  } catch (err) {
    console.error("[POST /api/signup/checkout] Gateway error:", err);
    // Frees the slug/email hold immediately rather than waiting 45 minutes
    // for a checkout that never got a working gateway session.
    await prisma.signupCheckout.update({ where: { id: checkout.id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
