import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin } from "@/lib/credentials";
import { isRateLimited } from "@/lib/rateLimit";

const bodySchema = z.object({
  currentPin: z.string().min(4).max(10),
  newPin: z.string().min(4).max(10).regex(/^\d+$/, "PIN must be numeric."),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await isRateLimited(`change-pin:${session.user.id}`, 60_000, 5)) {
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

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.role !== "EMPLOYEE" || !user.pinHash || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const newPinHash = await hashPin(parsed.data.newPin);
  // Bumping tokenVersion invalidates every mobile access/refresh token
  // issued before this change (see the schema comment on
  // User.tokenVersion) — this PIN is shared with the mobile app/kiosk
  // login, so a PIN change made here needs the same "stolen mobile token
  // doesn't survive it" guarantee as changing it from the mobile app
  // itself (see /api/mobile/change-pin). No mobile tokens to reissue here
  // — this route only ever runs inside a NextAuth web session, a separate
  // token system tokenVersion doesn't touch.
  await prisma.user.update({
    where: { id: user.id },
    data: { pinHash: newPinHash, tokenVersion: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
