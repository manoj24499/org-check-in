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

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/password-reset/confirm] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  if (await isRateLimited(`pw-reset-confirm:ip:${getClientIp(req)}`, 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const userId = await consumeUserToken(tx, parsed.data.token, "PASSWORD_RESET");
    if (!userId) return null;

    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, active: true } });
    if (!user || user.role !== "ADMIN" || !user.active) return null;

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    return { email: user.email };
  });

  if (!result) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }
  return NextResponse.json({ email: result.email });
}
