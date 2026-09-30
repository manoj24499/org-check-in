/**
 * SERVER-SIDE PRICING MIRROR — the source of truth for what a paid signup
 * is actually charged. Must be kept in sync BY HAND with
 * D:\projects\inzivo-website\lib\pricing.ts (the marketing site's copy,
 * used only for display and its live seat-count calculator) — the two
 * repos can't literally share a file. A client-supplied price is never
 * trusted; lib/billing/quote.ts always recomputes from this file. Bump
 * PRICING_VERSION whenever a price or minSeats value changes here.
 *
 * Prices are in PAISE (INR x 100) per employee per month, exclusive of
 * GST — same INR figures as the marketing site, converted to an integer
 * minor unit so amount math never touches floats.
 */

export const PRICING_VERSION = "v1";
// ISO 4217 code — what SignupCheckout.currency stores and what a payment
// gateway payload expects. For user-facing display, use CURRENCY_SYMBOL
// instead (matches inzivo-website/lib/pricing.ts's own CURRENCY = "₹").
export const CURRENCY = "INR";
export const CURRENCY_SYMBOL = "₹";
// An integer percentage, not a fraction (0.18) — lib/billing/quote.ts
// multiplies by this before dividing by 100, so tax is computed as
// subtotalPaise * 18 / 100 rather than subtotalPaise * 0.18. The latter
// multiplies by a non-terminating binary fraction before rounding, which
// only stays safe by luck while every price in PAID_PLANS happens to be a
// multiple of 100 paise — this form has no such dependency.
export const GST_RATE_PERCENT = 18;
// The marketing site's Enterprise tier has no self-serve price (`monthly:
// null`) and always routes to "Talk to sales" — it deliberately has no
// entry in PAID_PLANS below.
export const MAX_SELF_SERVE_SEATS = 500;

export type BillingCycle = "monthly" | "annual";

export type PaidPlan = {
  id: string;
  name: string;
  monthlyPaise: number;
  // Effective per-month price when billed yearly.
  annualPaise: number;
  minSeats: number;
};

export const PAID_PLANS: PaidPlan[] = [
  { id: "starter", name: "Starter", monthlyPaise: 5000, annualPaise: 4000, minSeats: 10 },
  { id: "growth", name: "Growth", monthlyPaise: 10000, annualPaise: 8000, minSeats: 20 },
  { id: "scale", name: "Scale", monthlyPaise: 17500, annualPaise: 14000, minSeats: 25 },
];

export function getPaidPlan(planId: string): PaidPlan | undefined {
  return PAID_PLANS.find((p) => p.id === planId);
}
