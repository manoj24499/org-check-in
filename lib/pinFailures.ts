import { prisma } from "@/lib/prisma";

/** An admin alert fires when one employee has at least this many wrong PINs inside the window. */
export const PIN_ALERT_MIN = 5;
export const PIN_ALERT_WINDOW_MS = 30 * 60_000;
const KEEP_MS = 14 * 24 * 3600_000;

/**
 * Remembers one wrong PIN (or one refused-because-locked attempt) for an existing employee. Never throws and never
 * delays the sign-in response: a failure to record must not change what the person sees.
 */
export function recordPinFailure(f: {
  organizationId: string;
  userId: string;
  employeeCode: string;
  source: "WEB" | "MOBILE" | "KIOSK";
  outcome: "WRONG_PIN" | "LOCKED";
  ipAddress?: string | null;
}): void {
  void prisma.pinFailure
    .create({ data: { ...f, ipAddress: f.ipAddress ?? null } })
    .then(() => {
      // Old rows are cleared now and then (about one write in fifty) instead of by a scheduled job.
      if (Math.random() < 0.02) {
        return prisma.pinFailure.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_MS) } } });
      }
    })
    .catch((err) => console.warn("[pinFailures] could not record:", err instanceof Error ? err.message : err));
}
