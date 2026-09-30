import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { getGateway } from "@/lib/billing/gateway";
import { provisionPaidSignup } from "@/lib/billing/provision";
import { withCors, corsPreflight } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

/** "j***@acme.com" — enough for the buyer to recognize their own address
 * without this public, unauthenticated-by-design endpoint exposing a full
 * email to anyone who merely holds the checkout ref link. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local[0] ?? ""}***@${domain}`;
}

type UiStatus = "pending" | "provisioned" | "failed" | "needs_attention";

function toUiStatus(status: string, lastPaymentError: string | null): UiStatus {
  if (status === "PROVISIONED") return "provisioned";
  if (status === "NEEDS_ATTENTION") return "needs_attention";
  if (status === "CANCELLED") return "failed";
  // PENDING: a recorded failed attempt still reads as "failed" to the
  // buyer even though the row itself stays open for a possible retry on
  // the same order (see lib/billing/provision.ts's own comment).
  return lastPaymentError ? "failed" : "pending";
}

/**
 * Polling backup for a slow or missing webhook — what
 * app/signup/complete/CompleteClient.tsx calls while waiting. Also what
 * makes local dev work without exposing this machine to the internet for
 * a real gateway's webhook to reach.
 */
export async function GET(req: NextRequest) {
  try {
    return withCors(await handleGet(req));
  } catch (err) {
    console.error("[GET /api/signup/status] Unhandled error:", err);
    return withCors(NextResponse.json({ error: "Internal server error." }, { status: 500 }));
  }
}

async function handleGet(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`signup-status:ip:${ip}`, 60_000, 60)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "Missing ref." }, { status: 400 });
  }

  let checkout = await prisma.signupCheckout.findUnique({ where: { publicRef: ref } });
  if (!checkout) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Only worth asking the gateway once the checkout has had a little time
  // to actually happen, and only while it's still open — avoids hammering
  // the gateway's API on every poll tick for a checkout that's already
  // resolved one way or the other.
  const isStillOpen = checkout.status === "PENDING" || checkout.status === "CANCELLED";
  const oldEnough = Date.now() - checkout.createdAt.getTime() > 10_000;
  if (isStillOpen && oldEnough && checkout.providerCheckoutId) {
    const gateway = getGateway();
    const result = await gateway.retrieveCheckout(checkout.providerCheckoutId);
    if (result.state === "paid" && result.providerPaymentId && result.amountPaise !== undefined && result.currency) {
      await provisionPaidSignup(checkout.id, {
        providerPaymentId: result.providerPaymentId,
        providerCustomerId: result.providerCustomerId,
        amountPaise: result.amountPaise,
        currency: result.currency,
      });
      checkout = await prisma.signupCheckout.findUnique({ where: { publicRef: ref } });
    } else if (result.state === "failed" && !checkout.lastPaymentError) {
      await prisma.signupCheckout.update({
        where: { id: checkout.id },
        data: { lastPaymentError: "gateway_reports_failed" },
      });
      checkout = await prisma.signupCheckout.findUnique({ where: { publicRef: ref } });
    }
  }

  if (!checkout) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: toUiStatus(checkout.status, checkout.lastPaymentError),
    emailMasked: maskEmail(checkout.adminEmail),
    lastPaymentError: checkout.lastPaymentError,
  });
}
