import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { signFakePayload } from "@/lib/billing/adapters/fake";
import { APP_BASE_URL } from "@/lib/appUrl";

/**
 * Backs the "Simulate success/failure" buttons on app/signup/dev-pay — signs
 * a fake gateway event server-side (the signing secret must never reach the
 * browser) and forwards it to the real webhook route, exercising the exact
 * same signature-verification path a real gateway's webhook would hit. Only
 * ever reached now by a signed-in admin's plan change (see app/plans/) — a
 * brand-new org's signup lands on the marketing site's own copy of this
 * same route instead (see that repo's app/api/signup/dev-pay), since it now
 * owns that whole journey.
 */
export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const form = await req.formData();
  const ref = String(form.get("ref") ?? "");
  const checkoutId = String(form.get("checkoutId") ?? "");
  const amount = Number(form.get("amount"));
  const currency = String(form.get("currency") ?? "INR");
  const outcome = form.get("outcome") === "failed" ? "failed" : "succeeded";

  // Same-origin check — this is a hidden form field a browser could in
  // theory be made to tamper with, so it's validated the same as any other
  // caller-supplied redirect target, even though this whole route is
  // already dev-only.
  function sameOriginOrFallback(raw: FormDataEntryValue | null, fallbackPath: string): URL {
    const fallback = new URL(fallbackPath, APP_BASE_URL);
    if (typeof raw !== "string") return fallback;
    try {
      const url = new URL(raw);
      return url.origin === new URL(APP_BASE_URL).origin ? url : fallback;
    } catch {
      return fallback;
    }
  }
  const successUrl = sameOriginOrFallback(form.get("successUrl"), "/plans/complete");
  const cancelUrl = sameOriginOrFallback(form.get("cancelUrl"), "/plans/complete");

  const payload = JSON.stringify({
    eventId: crypto.randomUUID(),
    type: outcome,
    providerCheckoutId: checkoutId,
    amountPaise: amount,
    currency,
  });
  const signature = signFakePayload(payload);

  await fetch(`${APP_BASE_URL}/api/billing/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-fake-signature": signature },
    body: payload,
  }).catch((err) => {
    console.error("[dev-pay] could not reach /api/billing/webhook (expected before it exists):", err);
  });

  const redirectUrl = outcome === "failed" ? cancelUrl : successUrl;
  if (!redirectUrl.searchParams.has("ref")) redirectUrl.searchParams.set("ref", ref);
  return NextResponse.redirect(redirectUrl);
}
