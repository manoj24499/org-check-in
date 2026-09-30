import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { createPlanChangeCheckout } from "@/lib/billing/planChange";

const bodySchema = z.object({
  plan: z.enum(["starter", "growth", "scale"]),
  cycle: z.enum(["monthly", "annual"]),
  seats: z.number().int(),
});

/**
 * Starts a self-serve plan change for the caller's own organization — the
 * signed-in counterpart to /api/signup/checkout. Requires an admin session;
 * there's no slug/email hold logic here since nothing new is being created.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/plan-change/checkout] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(req);
  if (await isRateLimited(`plan-change-checkout:org:${admin.organizationId}`, 60_000, 5)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }
  if (await isRateLimited(`plan-change-checkout:ip:${ip}`, 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const result = await createPlanChangeCheckout({
    organizationId: admin.organizationId,
    requestedByUserId: admin.userId,
    requestedByName: admin.session.user.name ?? "Admin",
    requestedByEmail: admin.session.user.email ?? "",
    planId: parsed.data.plan,
    cycle: parsed.data.cycle,
    seats: parsed.data.seats,
    ip,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, field: result.field }, { status: 400 });
  }

  return NextResponse.json({
    ref: result.ref,
    amountPaise: result.amountPaise,
    currency: result.currency,
    quote: result.quote,
    handoff: result.handoff,
  });
}
