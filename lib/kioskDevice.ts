import { createHash, randomBytes, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashTrackingToken } from "@/lib/trackingToken";

/** Header the paired kiosk sends with every request. */
export const KIOSK_DEVICE_HEADER = "x-kiosk-device";
export const PAIRING_CODE_TTL_MS = 15 * 60_000;

// Letters and digits that can't be mistaken for each other when read off a screen and typed in.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPairingCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(`kiosk-pairing:${normalizePairingCode(code)}`).digest("hex");
}

export function newDeviceToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashTrackingToken(token) };
}

// lastUsedAt is only for the admin's list, so it is refreshed at most this often per device.
const TOUCH_EVERY_MS = 10 * 60_000;
const lastTouched = new Map<string, number>();

/**
 * The paired kiosk making this request, or null: no header, an unknown token, a deleted device, or a device that
 * belongs to a different organization than the one the request is for.
 */
export async function resolveKioskDevice(req: Request, organizationId: string): Promise<{ id: string; name: string } | null> {
  const token = req.headers.get(KIOSK_DEVICE_HEADER);
  if (!token || token.length > 200) return null;
  const device = await prisma.kioskDevice.findUnique({
    where: { tokenHash: hashTrackingToken(token) },
    select: { id: true, name: true, organizationId: true },
  });
  if (!device || device.organizationId !== organizationId) return null;
  const now = Date.now();
  if (now - (lastTouched.get(device.id) ?? 0) > TOUCH_EVERY_MS) {
    lastTouched.set(device.id, now);
    void prisma.kioskDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { id: device.id, name: device.name };
}
