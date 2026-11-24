import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { hashPairingCode, newPairingCode, PAIRING_CODE_TTL_MS } from "@/lib/kioskDevice";

const bodySchema = z.object({ name: z.string().trim().min(1, "Give the kiosk a name.").max(60) });

/** Creates a kiosk device and returns its one-time pairing code (shown once, never stored in the clear). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });

  const count = await prisma.kioskDevice.count({ where: { organizationId: admin.organizationId } });
  if (count >= 20) return NextResponse.json({ error: "You already have 20 kiosk devices. Remove one you no longer use first." }, { status: 400 });

  const code = newPairingCode();
  const device = await prisma.kioskDevice.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data.name,
      pairingCodeHash: hashPairingCode(code),
      pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
    },
    select: { id: true },
  });
  return NextResponse.json({ id: device.id, code, expiresInMinutes: PAIRING_CODE_TTL_MS / 60_000 });
}
