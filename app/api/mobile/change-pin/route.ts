import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin, isPinTakenByAnotherEmployee } from "@/lib/credentials";
import { isRateLimited } from "@/lib/rateLimit";
import { requireMobileUser, signAccessToken, signRefreshToken } from "@/lib/mobileAuth";

const bodySchema = z.object({
  currentPin: z.string().min(4).max(10),
  newPin: z.string().min(4).max(10).regex(/^\d+$/, "PIN must be numeric."),
});

export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isRateLimited(`change-pin:${auth.sub}`, 60_000, 5)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || user.role !== "EMPLOYEE" || !user.pinHash || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 403, not 401: a wrong current-PIN entry is a business rejection, not an
  // expired/invalid session — the API client retries session-protected 401s
  // with a refreshed token, which would otherwise misfire here and could log
  // the employee out on a simple typo if the refresh itself failed.
  const currentValid = await verifyPin(parsed.data.currentPin, user.pinHash);
  if (!currentValid) {
    return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 403 });
  }

  if (parsed.data.newPin === parsed.data.currentPin) {
    return NextResponse.json(
      { error: "New PIN must be different from the current PIN." },
      { status: 400 },
    );
  }

  // employeeCode isn't secret, so a PIN shared with another employee (even
  // though login itself stays correctly scoped per-employee) lets either
  // one deliberately log in as the other — see isPinTakenByAnotherEmployee's
  // own comment.
  if (await isPinTakenByAnotherEmployee(parsed.data.newPin, user.id)) {
    return NextResponse.json(
      { error: "That PIN is already taken. Please choose a different one." },
      { status: 409 },
    );
  }

  const newPinHash = await hashPin(parsed.data.newPin);
  // Bumping tokenVersion invalidates every mobile token issued before this
  // moment (see the schema comment on User.tokenVersion) — including a
  // stolen copy of *this device's own* previous token pair, which is the
  // whole point. That would also log this device itself out on its very
  // next request, so a fresh pair reflecting the new version is issued
  // below and returned here instead of forcing an immediate re-login.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: newPinHash, tokenVersion: { increment: 1 } },
  });

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(updated),
    signRefreshToken(updated),
  ]);

  return NextResponse.json({ success: true, accessToken, refreshToken });
}
