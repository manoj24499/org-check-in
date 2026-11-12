import { Expo } from "expo-server-sdk";
import { prisma } from "@/lib/prisma";
import { logAttendanceEvent } from "@/lib/attendanceEvents";

const expo = new Expo();

/**
 * Best-effort push send — never throws, so a failure here can never block
 * whatever triggered it (e.g. a location-ping response). Only cleans up a
 * token on an immediate "DeviceNotRegistered" ticket error; genuine
 * unregistration that only shows up later via Expo's receipt API isn't
 * checked here (would need a scheduled job, which this app doesn't have).
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  // Optional payload the app receives with the notification (e.g. which screen to open) — see the
  // hybrid work-mode prompts in /api/kiosk/location. Omitted, the message is exactly as before.
  data?: Record<string, string>,
): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId } });
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (validTokens.length === 0) {
      // Worth knowing when a warning was never deliverable (no phone registered for notifications).
      void logAttendanceEvent({
        userId,
        kind: "PUSH_SENT",
        actor: "SYSTEM",
        summary: `Notification "${title}" was NOT delivered: no device registered for push notifications.`,
        detail: { title, body, ...(data ? { data } : {}), devices: 0, delivered: 0 },
      });
      return;
    }

    const messages = validTokens.map((t) => ({ to: t.token, title, body, ...(data ? { data } : {}) }));
    const tickets = await expo.sendPushNotificationsAsync(messages);
    const delivered = tickets.filter((t) => t.status === "ok").length;
    const errors = tickets.flatMap((t) => (t.status === "error" ? [t.details?.error ?? t.message ?? "error"] : []));
    void logAttendanceEvent({
      userId,
      kind: "PUSH_SENT",
      actor: "SYSTEM",
      summary:
        delivered > 0
          ? `Notification sent to the phone: "${title}".`
          : `Notification "${title}" was NOT delivered (${errors.join(", ") || "rejected by the push service"}).`,
      detail: { title, body, ...(data ? { data } : {}), devices: validTokens.length, delivered, errors },
    });

    const staleTokens = validTokens.filter(
      (_, i) => tickets[i]?.status === "error" && tickets[i].details?.error === "DeviceNotRegistered",
    );
    if (staleTokens.length > 0) {
      await prisma.pushToken.deleteMany({
        where: { id: { in: staleTokens.map((t) => t.id) } },
      });
    }
  } catch (error) {
    console.error("[sendPushNotification] failed:", error);
  }
}
