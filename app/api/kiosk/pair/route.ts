import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { resolveActiveOrgBySlug } from "@/lib/organization";
import { hashPairingCode, newDeviceToken } from "@/lib/kioskDevice";

const bodySchema = z.object({
  orgSlug: z.string().min(1).default("default"),
  code: z.string().min(4).max(40),
});

/**
 * Pairs the browser on a kiosk with a device an admin created: the one-time code is exchanged for a long-lived
 * token, which the kiosk keeps and sends with later requests. The code works once and expires.
 */
export async function POST(req: NextRequest) {
  // Codes are 8 characters from a 32-letter alphabet; this keeps guessing one hopeless.
  if (await isRateLimited(`kiosk-pair:${getClientIp(req)}`, 15 * 60_000, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the pairing code." }, { status: 400 });

  const org = await resolveActiveOrgBySlug(parsed.data.orgSlug);
  const invalid = NextResponse.json({ error: "That code isn't valid or has expired. Ask your admin for a new one." }, { status: 400 });
  if (!org) return invalid;

  const device = await prisma.kioskDevice.findFirst({
    where: {
      organizationId: org.id,
      pairingCodeHash: hashPairingCode(parsed.data.code),
      pairingExpiresAt: { gt: new Date() },
      tokenHash: null,
    },
    select: { id: true, name: true },
  });
  if (!device) return invalid;

  const { token, hash } = newDeviceToken();
  // Claimed in one conditional update so two requests with the same code can't both succeed.
  const claimed = await prisma.kioskDevice.updateMany({
    where: { id: device.id, tokenHash: null },
    data: { tokenHash: hash, pairedAt: new Date(), lastUsedAt: new Date(), pairingCodeHash: null, pairingExpiresAt: null },
  });
  if (claimed.count === 0) return invalid;

  return NextResponse.json({ token, name: device.name });
}
