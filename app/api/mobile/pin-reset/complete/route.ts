import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, isPinTakenByAnotherEmployee, pinLookupHash, MIN_PIN_LENGTH } from "@/lib/credentials";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { revokeAllRefreshTokensForUser } from "@/lib/mobileAuth";
import { resetTokenMatches, verifyResetToken } from "@/lib/pinReset";

const bodySchema = z.object({
  resetToken: z.string().min(1),
  newPin: z
    .string()
    .min(MIN_PIN_LENGTH, `PIN must be at least ${MIN_PIN_LENGTH} digits.`)
    .max(10)
    .regex(/^\d+$/, "PIN must be numeric."),
});

const EXPIRED = { error: "This reset has expired. Start again with a new code from your admin." };

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/mobile/pin-reset/complete] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  if (await isRateLimited(`pin-reset-complete:${getClientIp(req)}`, 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const pinIssue = parsed.error.issues.find((i) => i.path[0] === "newPin");
    return NextResponse.json({ error: pinIssue?.message ?? "Invalid request." }, { status: 400 });
  }

  const token = await verifyResetToken(parsed.data.resetToken);
  if (!token) return NextResponse.json(EXPIRED, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  const now = new Date();
  if (
    !user ||
    user.role !== "EMPLOYEE" ||
    !user.active ||
    !user.organizationId ||
    !user.pinResetExpiresAt ||
    user.pinResetExpiresAt <= now ||
    !resetTokenMatches(user.pinResetHash, token.tag)
  ) {
    return NextResponse.json(EXPIRED, { status: 400 });
  }

  // Same rule as every other place a PIN is set: two people at one organization must not share one.
  // A refusal here leaves the reset code usable, so they can simply pick a different PIN.
  if (await isPinTakenByAnotherEmployee(parsed.data.newPin, user.organizationId, user.id)) {
    return NextResponse.json(
      { error: "That PIN is already taken. Please choose a different one." },
      { status: 409 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPin(parsed.data.newPin),
      pinLookupHash: pinLookupHash(user.organizationId, parsed.data.newPin),
      // The code works once: clearing it also kills the reset token.
      pinResetHash: null,
      pinResetExpiresAt: null,
      pinResetAttempts: 0,
      // Signs out every phone that held the old PIN's session; the employee signs in again with the new one.
      tokenVersion: { increment: 1 },
    },
  });
  await revokeAllRefreshTokensForUser(user.id);

  return NextResponse.json({ success: true });
}
