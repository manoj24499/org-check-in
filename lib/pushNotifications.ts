import { Expo } from "expo-server-sdk";
import { prisma } from "@/lib/prisma";

const expo = new Expo();

/**
 * Best-effort push send — never throws, so a failure here can never block
 * whatever triggered it (e.g. a location-ping response). Only cleans up a
 * token on an immediate "DeviceNotRegistered" ticket error; genuine
 * unregistration that only shows up later via Expo's receipt API isn't
 * checked here (would need a scheduled job, which this app doesn't have).
 */
export async function sendPushNotification(userId: string, title: string, body: string): Promise<void> {
  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId } });
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (validTokens.length === 0) return;

    const messages = validTokens.map((t) => ({ to: t.token, title, body }));
    const tickets = await expo.sendPushNotificationsAsync(messages);

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
