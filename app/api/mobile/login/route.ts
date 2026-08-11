import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/credentials";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { signAccessToken, signRefreshToken } from "@/lib/mobileAuth";

const bodySchema = z.object({
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(10),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`mobile-login:${ip}`, 60_000, 10)) {
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

  const user = await prisma.user.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
  });

  const valid =
    !!user?.pinHash && user.role === "EMPLOYEE" && user.active &&
    (await verifyHash(parsed.data.pin, user.pinHash));

  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid employee code or PIN." }, { status: 401 });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user),
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      role: user.role,
      workMode: user.workMode,
    },
  });
}
