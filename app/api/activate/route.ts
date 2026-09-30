import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { consumeUserToken } from "@/lib/userToken";

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

/**
 * Sets the password for an admin account provisioned with none (see
 * lib/billing/provision.ts, once that exists) — the other half of the
 * signed activation link emailed after a paid signup. A brand-new
 * unauthenticated write endpoint, so it gets the same rate-limit treatment
 * every other credential-setting surface in this app already has.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/activate] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`activate:ip:${ip}`, 60_000, 10)) {
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

  const result = await prisma.$transaction(async (tx) => {
    const userId = await consumeUserToken(tx, parsed.data.token, "ACCOUNT_ACTIVATION");
    if (!userId) return null;

    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } });
    // An activation link can never overwrite an existing password — if this
    // admin already has one (e.g. the link was already used, or activated
    // some other way), the token is still consumed above (so it can't be
    // replayed again), but nothing here is changed.
    if (!user || user.passwordHash !== null) return null;

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { email: user.email };
  });

  if (!result) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }
  return NextResponse.json({ email: result.email });
}
