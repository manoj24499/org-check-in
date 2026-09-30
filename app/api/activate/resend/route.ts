import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { issueUserToken } from "@/lib/userToken";
import { APP_BASE_URL } from "@/lib/appUrl";
import { isProductionRuntime } from "@/lib/isProduction";
import { withCors, corsPreflight } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflight();
}

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

const ACTIVATION_TTL_MS = 72 * 60 * 60_000;

/**
 * Re-issues an activation link. Always responds 200 { ok: true } regardless
 * of whether the email matched anything, was rate-limited, or was even
 * valid input — the only way to keep this endpoint from being usable to
 * discover which emails have an account (see app/api/register/route.ts's
 * check-slug endpoint for the same non-enumeration concern, applied there
 * to slugs instead of emails).
 */
export async function POST(req: NextRequest) {
  try {
    await handlePost(req);
  } catch (err) {
    console.error("[POST /api/activate/resend] Unhandled error:", err);
  }
  return withCors(NextResponse.json({ ok: true }));
}

async function handlePost(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return;

  const ip = getClientIp(req);
  const email = parsed.data.email;
  const ipLimited = await isRateLimited(`activate-resend:ip:${ip}`, 10 * 60_000, 5);
  if (ipLimited) return;
  const emailLimited = await isRateLimited(`activate-resend:email:${email}`, 60 * 60_000, 3);
  if (emailLimited) return;

  // Scoped to isOwner + passwordHash: null — the only accounts this flow
  // ever creates one for (see lib/billing/provision.ts). A regular
  // already-activated admin's email matching here would be a bug
  // elsewhere, not something this endpoint should ever act on.
  const user = await prisma.user.findFirst({
    where: { email, role: "ADMIN", isOwner: true, active: true, passwordHash: null },
    select: { id: true },
  });
  if (!user) return;

  const raw = await prisma.$transaction((tx) => issueUserToken(tx, user.id, "ACCOUNT_ACTIVATION", ACTIVATION_TTL_MS));

  // TODO(email infra phase): replace with lib/email.ts's sendEmail() once
  // built — this mirrors that module's own planned dev-fallback (log
  // instead of send), since no email provider is wired up yet. Gated to
  // non-production: the raw token is a bearer credential that sets this
  // admin's password (full tenant takeover for its 72-hour life) — logging
  // it in production would leak that credential to anything with log
  // access (a log drain, an error tracker ingesting stdout, ...). Until a
  // real provider exists, a production call to this route safely issues a
  // token that's simply never delivered anywhere, rather than leaking it.
  if (!isProductionRuntime()) {
    console.info(`[activate/resend] link for ${email}: ${APP_BASE_URL}/activate?token=${raw}`);
  }
}
