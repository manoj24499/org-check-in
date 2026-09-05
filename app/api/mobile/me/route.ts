import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    role: user.role,
    workMode: user.workMode,
    homeLatitude: user.homeLatitude,
    homeLongitude: user.homeLongitude,
    homeRadiusMeters: user.homeRadiusMeters,
    // See /api/mobile/login's identical field — lets the client re-check
    // this on app resume (a token refresh alone doesn't re-fetch it).
    faceVerificationEnabled: user.faceVerificationEnabled,
    // Admin escape hatch for the mandatory first-login enrollment gate (see
    // RootNavigator.tsx) — lets an employee stuck there get in without
    // actually turning on check-in enforcement for someone never enrolled.
    faceVerificationExempt: user.faceVerificationExempt,
    shiftRemindersEnabled: user.shiftRemindersEnabled,
  });
}

const patchSchema = z.object({
  shiftRemindersEnabled: z.boolean(),
});

/**
 * Persists the mobile app's "Shift reminders" toggle (Profile screen)
 * server-side — the server is what decides whether to actually push a
 * shift-end/overtime-end reminder (see /api/kiosk/location), so it needs
 * the employee's preference, not just the device's local notification
 * permission state.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: auth.sub },
    data: { shiftRemindersEnabled: parsed.data.shiftRemindersEnabled },
  });

  return NextResponse.json({ shiftRemindersEnabled: user.shiftRemindersEnabled });
}
