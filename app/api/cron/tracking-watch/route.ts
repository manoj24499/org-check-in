import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/pushNotifications";
import { findSilentFieldWorkers, GIVE_UP_AFTER_MS, REALERT_AFTER_MS } from "@/lib/trackingWatch";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-secret");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Run every few minutes by a scheduler on the server (see README / crontab). Finds checked-in
 * field workers whose phone has stopped sending location and nudges them with a push
 * notification, so the problem is fixed during the day instead of discovered in the report.
 * Each worker is nudged at most once per REALERT_AFTER_MS, and not at all after GIVE_UP_AFTER_MS.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const silent = await findSilentFieldWorkers(undefined, now);
  let alerted = 0;
  for (const w of silent) {
    if (w.silentMs > GIVE_UP_AFTER_MS) continue;
    if (w.trackingAlertSentAt && now.getTime() - w.trackingAlertSentAt.getTime() < REALERT_AFTER_MS) continue;
    await sendPushNotification(
      w.userId,
      "Location sharing has stopped",
      "Open the Inzivo app so your route keeps recording. Check that location is set to “Allow all the time” and battery saving is off for the app.",
    );
    await prisma.attendance.update({ where: { id: w.attendanceId }, data: { trackingAlertSentAt: now } });
    alerted++;
  }
  return NextResponse.json({ silent: silent.length, alerted });
}

export const GET = handle;
export const POST = handle;
