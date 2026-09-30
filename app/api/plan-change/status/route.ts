import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getGateway } from "@/lib/billing/gateway";
import { applyPlanChange } from "@/lib/billing/planChange";

type UiStatus = "pending" | "applied" | "failed" | "needs_attention";

function toUiStatus(status: string, lastPaymentError: string | null): UiStatus {
  if (status === "APPLIED") return "applied";
  if (status === "NEEDS_ATTENTION") return "needs_attention";
  if (status === "CANCELLED") return "failed";
  return lastPaymentError ? "failed" : "pending";
}

/**
 * Polling backup for a slow or missing webhook — same role as
 * /api/signup/status, but requires an admin session AND checks the
 * checkout belongs to that admin's own organization. Unlike a brand-new
 * signup (where no session can exist yet, so the ref alone is the
 * capability), a plan change always has an authenticated admin available,
 * so this closes off guessing/leaking another company's ref as a way to
 * see their plan-change status.
 */
export async function GET(req: NextRequest) {
  try {
    return await handleGet(req);
  } catch (err) {
    console.error("[GET /api/plan-change/status] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handleGet(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isRateLimited(`plan-change-status:org:${admin.organizationId}`, 60_000, 60)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) {
    return NextResponse.json({ error: "Missing ref." }, { status: 400 });
  }

  let checkout = await prisma.planChangeCheckout.findUnique({ where: { publicRef: ref } });
  if (!checkout || checkout.organizationId !== admin.organizationId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isStillOpen = checkout.status === "PENDING" || checkout.status === "CANCELLED";
  const oldEnough = Date.now() - checkout.createdAt.getTime() > 10_000;
  if (isStillOpen && oldEnough && checkout.providerCheckoutId) {
    const gateway = getGateway();
    const result = await gateway.retrieveCheckout(checkout.providerCheckoutId);
    if (result.state === "paid" && result.providerPaymentId && result.amountPaise !== undefined && result.currency) {
      await applyPlanChange(checkout.id, {
        providerPaymentId: result.providerPaymentId,
        providerCustomerId: result.providerCustomerId,
        amountPaise: result.amountPaise,
        currency: result.currency,
      });
      checkout = await prisma.planChangeCheckout.findUnique({ where: { publicRef: ref } });
    } else if (result.state === "failed" && !checkout.lastPaymentError) {
      await prisma.planChangeCheckout.update({
        where: { id: checkout.id },
        data: { lastPaymentError: "gateway_reports_failed" },
      });
      checkout = await prisma.planChangeCheckout.findUnique({ where: { publicRef: ref } });
    }
  }

  if (!checkout) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: toUiStatus(checkout.status, checkout.lastPaymentError),
    planId: checkout.planId,
    seats: checkout.seats,
    lastPaymentError: checkout.lastPaymentError,
  });
}
