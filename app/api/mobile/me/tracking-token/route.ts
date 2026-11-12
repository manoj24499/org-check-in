import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { findActiveCheckIn } from "@/lib/activeSession";
import { isRateLimited } from "@/lib/rateLimit";
import { newTrackingToken } from "@/lib/trackingToken";

/**
 * Re-issues the location-upload secret for the caller's OWN open session.
 *
 * The secret is handed out once, in the check-in response. If that response never reached the phone
 * (the request was slow or the connection dropped after the server had already recorded it), the phone
 * has no secret for a session that exists. It can still upload location with its sign-in, but that
 * expires every 15 minutes and cannot be renewed from the background. This lets the phone ask for a
 * fresh secret instead, proving who it is with its sign-in.
 *
 * Replaces the stored hash, so any earlier secret for this session stops working. Only the session's
 * own employee, and only while it is still open.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isRateLimited(`tracking-token:${auth.sub}`, 60_000, 6)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a moment and try again." }, { status: 429 });
  }

  const json = (await req.json().catch(() => null)) as { attendanceId?: unknown } | null;
  const attendanceId = typeof json?.attendanceId === "string" ? json.attendanceId : null;

  const active = await findActiveCheckIn(auth.sub);
  if (!active || (attendanceId && attendanceId !== active.id)) {
    return NextResponse.json({ error: "You're not checked in right now." }, { status: 409 });
  }

  const secret = newTrackingToken();
  await prisma.attendance.update({ where: { id: active.id }, data: { trackingTokenHash: secret.hash } });

  return NextResponse.json({ attendanceId: active.id, trackingToken: secret.token });
}
