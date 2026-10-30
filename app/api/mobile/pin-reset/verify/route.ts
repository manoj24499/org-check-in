import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/credentials";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { resolveOrgBySlug } from "@/lib/organization";
import { RESET_CODE_MAX_ATTEMPTS, signResetToken } from "@/lib/pinReset";

const bodySchema = z.object({
  organizationCode: z.string().min(1),
  employeeCode: z.string().min(1),
  code: z.string().regex(/^\d{4,10}$/),
});

// One message for "no such employee / no code issued / expired", so this can't be used to find out which
// employee codes exist. Not 401: the app treats 401 on a signed-in call as an expired session.
const INVALID = { error: "That reset code isn't valid or has expired. Ask your admin for a new one." };

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/mobile/pin-reset/verify] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  if (await isRateLimited(`pin-reset-verify:${getClientIp(req)}`, 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit reset code from your admin." }, { status: 400 });

  const org = await resolveOrgBySlug(parsed.data.organizationCode);
  if (!org) return NextResponse.json({ error: "Invalid organization code." }, { status: 400 });
  if (org.status === "SUSPENDED") {
    return NextResponse.json({ error: "This organization is currently disabled." }, { status: 403 });
  }
  // Same per-account budget as PIN sign-in, so the reset code can't be used as a second way to guess.
  if (await isPinGuessLimited(org.id, parsed.data.employeeCode)) {
    return NextResponse.json(
      { error: "Too many attempts for this employee code. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findFirst({
    where: { organizationId: org.id, employeeCode: parsed.data.employeeCode },
  });
  const now = new Date();
  if (
    !user ||
    user.role !== "EMPLOYEE" ||
    !user.active ||
    !user.pinResetHash ||
    !user.pinResetExpiresAt ||
    user.pinResetExpiresAt <= now
  ) {
    return NextResponse.json(INVALID, { status: 400 });
  }

  if (!(await verifyPin(parsed.data.code, user.pinResetHash))) {
    const attempts = user.pinResetAttempts + 1;
    if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pinResetHash: null, pinResetExpiresAt: null, pinResetAttempts: 0 },
      });
      return NextResponse.json(
        { error: "Too many wrong codes. That reset code is cancelled, so ask your admin for a new one." },
        { status: 403 },
      );
    }
    await prisma.user.update({ where: { id: user.id }, data: { pinResetAttempts: attempts } });
    const left = RESET_CODE_MAX_ATTEMPTS - attempts;
    return NextResponse.json(
      { error: `Wrong reset code. ${left} ${left === 1 ? "try" : "tries"} left.` },
      { status: 400 },
    );
  }

  return NextResponse.json({
    resetToken: await signResetToken(user.id, user.pinResetHash),
    name: user.name,
  });
}
