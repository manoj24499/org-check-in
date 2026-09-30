import { CURRENCY, GST_RATE_PERCENT, MAX_SELF_SERVE_SEATS, PRICING_VERSION, getPaidPlan, type BillingCycle } from "./plans";

export type Quote = {
  planId: string;
  billingCycle: BillingCycle;
  seats: number;
  pricePerSeatPaise: number;
  months: number;
  subtotalPaise: number;
  taxPaise: number;
  amountPaise: number;
  currency: string;
  pricingVersion: string;
};

export type QuoteError = { error: string; field: "plan" | "cycle" | "seats" };

export function isQuoteError(result: Quote | QuoteError): result is QuoteError {
  return "error" in result;
}

/**
 * The one place a checkout amount is computed — never trust a
 * client-supplied price (see lib/billing/plans.ts). Pure and side-effect
 * free so it can also back a client-side live-price preview without
 * duplicating the arithmetic.
 */
export function computeQuote(planId: string, cycle: BillingCycle | string, seats: number): Quote | QuoteError {
  const plan = getPaidPlan(planId);
  if (!plan) {
    return { error: "Unknown or unsupported plan.", field: "plan" };
  }
  if (cycle !== "monthly" && cycle !== "annual") {
    return { error: "Invalid billing cycle.", field: "cycle" };
  }
  if (!Number.isInteger(seats) || seats < plan.minSeats) {
    return { error: `This plan requires at least ${plan.minSeats} seats.`, field: "seats" };
  }
  if (seats > MAX_SELF_SERVE_SEATS) {
    return { error: "For this many seats, talk to sales.", field: "seats" };
  }

  const pricePerSeatPaise = cycle === "annual" ? plan.annualPaise : plan.monthlyPaise;
  const months = cycle === "annual" ? 12 : 1;
  const subtotalPaise = pricePerSeatPaise * seats * months;
  // Integer-only until the final rounding step — see GST_RATE_PERCENT's
  // own comment on why subtotalPaise * 0.18 isn't equivalent.
  const taxPaise = Math.round((subtotalPaise * GST_RATE_PERCENT) / 100);
  const amountPaise = subtotalPaise + taxPaise;

  return {
    planId: plan.id,
    billingCycle: cycle,
    seats,
    pricePerSeatPaise,
    months,
    subtotalPaise,
    taxPaise,
    amountPaise,
    currency: CURRENCY,
    pricingVersion: PRICING_VERSION,
  };
}
