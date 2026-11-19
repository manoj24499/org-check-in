import { prisma } from "@/lib/prisma";

/**
 * One registered phone per employee. Stops the "install the app on a spare phone, leave it at home, walk
 * around with another" cheat at the point where it starts: the second phone can't sign in (or keep a session
 * alive) without the admin approving it.
 *
 * The phone sends a stable id in the X-App-Device-Id header (Android ID). It is set by the caller, so this
 * stops honest-looking mistakes and casual sharing, not someone who forges headers; the movement alerts in
 * lib/stationaryWatch.ts cover the rest.
 *
 * Requests with no id (older app builds, kiosks) are let through, so the rollout can't lock anyone out; once
 * everyone is on the new build this can be tightened to require an id.
 */
export interface DeviceCheck {
  allowed: boolean;
  /** Message for the app when not allowed. */
  message?: string;
}

const MISMATCH_MESSAGE =
  "This account is registered to a different phone. Your admin has been told you tried to sign in here, and can approve this phone.";

export const DEVICE_MISMATCH_CODE = "DEVICE_MISMATCH";

export function readDeviceId(req: Request): { id: string | null; label: string | null } {
  const clean = (v: string | null, max: number) => {
    const s = v?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
    return s || null;
  };
  return { id: clean(req.headers.get("x-app-device-id"), 100), label: clean(req.headers.get("x-app-device"), 80) };
}

export async function checkDevice(
  user: { id: string; boundDeviceId: string | null },
  req: Request,
): Promise<DeviceCheck> {
  const { id, label } = readDeviceId(req);
  if (!id) return { allowed: true };

  if (!user.boundDeviceId) {
    // First phone to sign in is the registered one. updateMany with the null guard so two phones signing in at
    // the same moment can't both win: only one write matches.
    const claimed = await prisma.user.updateMany({
      where: { id: user.id, boundDeviceId: null },
      data: { boundDeviceId: id, boundDeviceLabel: label, boundDeviceAt: new Date(), pendingDeviceId: null, pendingDeviceLabel: null, pendingDeviceAt: null },
    });
    if (claimed.count === 1) return { allowed: true };
    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { boundDeviceId: true } });
    if (fresh?.boundDeviceId === id) return { allowed: true };
  } else if (user.boundDeviceId === id) {
    return { allowed: true };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { pendingDeviceId: id, pendingDeviceLabel: label, pendingDeviceAt: new Date() },
  });
  return { allowed: false, message: MISMATCH_MESSAGE };
}
