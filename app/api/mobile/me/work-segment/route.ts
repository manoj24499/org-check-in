import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { startOfISTDay } from "@/lib/istTime";

/** The employee's currently active (checked-in today, not yet checked out) session. */
async function findActiveCheckIn(userId: string) {
  const today = startOfISTDay();
  const checkIn = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_IN", timestamp: { gte: today } },
    orderBy: { timestamp: "desc" },
  });
  if (!checkIn) return null;

  const laterCheckOut = await prisma.attendance.findFirst({
    where: { userId, type: "CHECK_OUT", timestamp: { gt: checkIn.timestamp } },
  });
  return laterCheckOut ? null : checkIn;
}

const bodySchema = z.object({
  mode: z.enum(["OFFICE", "FIELD"]),
});

/**
 * Manual correction of a FIELD-workMode employee's current Field/Office
 * segment — for when GPS auto-detection (see /api/kiosk/location's
 * evaluateWorkSegment) is late, wrong, or unavailable (e.g. indoors). Only
 * ever meaningful for FIELD-workMode profiles; OFFICE/WFH employees have no
 * segment timeline to switch.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || user.workMode !== "FIELD") {
    return NextResponse.json({ error: "This only applies to Field-mode employees." }, { status: 400 });
  }

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) {
    return NextResponse.json({ error: "You're not checked in right now." }, { status: 409 });
  }

  const current = await prisma.workSegment.findFirst({
    where: { attendanceId: checkIn.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (current?.mode === parsed.data.mode) {
    // Already in the requested mode — nothing to do.
    return NextResponse.json({ mode: current.mode, startedAt: current.startedAt.toISOString() });
  }

  const now = new Date();
  const createSegment = prisma.workSegment.create({
    data: { attendanceId: checkIn.id, mode: parsed.data.mode, startedAt: now, startMethod: "MANUAL" },
  });
  const created = current
    ? (
        await prisma.$transaction([
          prisma.workSegment.update({ where: { id: current.id }, data: { endedAt: now } }),
          createSegment,
        ])
      )[1]
    : await createSegment;

  return NextResponse.json({ mode: created.mode, startedAt: created.startedAt.toISOString() });
}

/** The current segment's mode, for the mobile app's live indicator. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json({ mode: null });

  const current = await prisma.workSegment.findFirst({
    where: { attendanceId: checkIn.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    mode: current?.mode ?? null,
    startedAt: current?.startedAt.toISOString() ?? null,
  });
}
