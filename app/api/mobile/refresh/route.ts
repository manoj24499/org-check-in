import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken, verifyMobileToken } from "@/lib/mobileAuth";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const payload = await verifyMobileToken(parsed.data.refreshToken, "refresh");
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired session. Please log in again." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ error: "Account is no longer active." }, { status: 401 });
  }

  // Rotate both tokens on every refresh.
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    signRefreshToken(user),
  ]);

  return NextResponse.json({ accessToken, refreshToken });
}
