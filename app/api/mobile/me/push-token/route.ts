import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

const bodySchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Upsert on the token itself (unique) — the same physical device
  // re-registering (e.g. after a reinstall, or a different employee signing
  // in) just re-points the existing row at the current user.
  await prisma.pushToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: auth.sub },
    create: { userId: auth.sub, token: parsed.data.token },
  });

  return NextResponse.json({ success: true });
}
