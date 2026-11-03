import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin, isPinTakenByAnotherEmployee, pinLookupHash, MIN_PIN_LENGTH } from "@/lib/credentials";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { resolveOrgBySlug } from "@/lib/organization";
import { revokeAllRefreshTokensForUser } from "@/lib/mobileAuth";

const bodySchema = z.object({
  organizationCode: z.string().min(1),
  employeeCode: z.string().min(1),
  tempPin: z.string().min(4).max(10),
  newPin: z
    .string()
    .min(MIN_PIN_LENGTH, `PIN must be at least ${MIN_PIN_LENGTH} digits.`)
    .max(10)
    .regex(/^\d+$/, "PIN must be numeric."),
});

/**
 * First sign-in for an employee whose PIN an admin generated (a new employee, or after "Regenerate PIN"):
 * they enter that temporary PIN and choose their own in one step, then sign in normally with the new one.
 * Not signed in, so it's guarded like the login route: per-IP limit plus the per-account PIN-guess limit
 * shared with every other place a PIN is checked.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/mobile/set-initial-pin] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  if (await isRateLimited(`set-initial-pin:${getClientIp(req)}`, 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const pinIssue = parsed.error.issues.find((i) => i.path[0] === "newPin");
    return NextResponse.json({ error: pinIssue?.message ?? "Invalid request." }, { status: 400 });
  }

  const org = await resolveOrgBySlug(parsed.data.organizationCode);
  if (!org) return NextResponse.json({ error: "Invalid organization code." }, { status: 400 });
  if (org.status === "SUSPENDED") {
    return NextResponse.json({ error: "This organization is currently disabled." }, { status: 403 });
  }
  if (await isPinGuessLimited(org.id, parsed.data.employeeCode)) {
    return NextResponse.json(
      { error: "Too many attempts for this employee code. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findFirst({
    where: { organizationId: org.id, employeeCode: parsed.data.employeeCode },
  });
  // 400, not 401: the app treats 401 on a signed-in call as an expired session.
  if (
    !user ||
    user.role !== "EMPLOYEE" ||
    !user.active ||
    !user.pinHash ||
    !(await verifyPin(parsed.data.tempPin, user.pinHash))
  ) {
    return NextResponse.json({ error: "Invalid employee code or temporary PIN." }, { status: 400 });
  }
  if (!user.pinMustChange) {
    return NextResponse.json(
      { error: "Your PIN is already set up. Sign in with it, or ask your admin if you forgot it." },
      { status: 400 },
    );
  }
  if (parsed.data.newPin === parsed.data.tempPin) {
    return NextResponse.json({ error: "Your new PIN must be different from the temporary PIN." }, { status: 400 });
  }
  if (await isPinTakenByAnotherEmployee(parsed.data.newPin, org.id, user.id)) {
    return NextResponse.json(
      { error: "That PIN is already taken. Please choose a different one." },
      { status: 409 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPin(parsed.data.newPin),
      pinLookupHash: pinLookupHash(org.id, parsed.data.newPin),
      pinMustChange: false,
      tokenVersion: { increment: 1 },
    },
  });
  await revokeAllRefreshTokensForUser(user.id);

  return NextResponse.json({ success: true });
}
