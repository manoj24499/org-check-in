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
  startTime: z.string(),
  endTime: z.string(),
});

/**
 * Self-declared, takes effect immediately (no approval step) — see
 * /api/kiosk/location's evaluateTimedPermission for how the resulting pause
 * actually opens/resolves as location pings arrive.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (endTime <= startTime) {
    return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
  }

  const today = startOfISTDay();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (startTime < today || startTime >= tomorrow) {
    return NextResponse.json({ error: "Timed permission must be for today." }, { status: 400 });
  }

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) {
    return NextResponse.json(
      { error: "Check in before requesting a timed permission." },
      { status: 409 },
    );
  }

  // Refuse a second request while one is still pending/unresolved — avoids
  // ambiguity about which permission governs the pause /api/kiosk/location
  // manages. A REJECTED permission doesn't count — it never controlled
  // anything, so there's no reason to block a fresh request because of it.
  const existing = await prisma.timedPermission.findFirst({
    where: {
      attendanceId: checkIn.id,
      approvalStatus: { not: "REJECTED" },
      OR: [{ pause: null }, { pause: { resumedAt: null } }],
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have an active timed permission today." },
      { status: 409 },
    );
  }

  const permission = await prisma.timedPermission.create({
    data: { attendanceId: checkIn.id, startTime, endTime },
  });

  return NextResponse.json({
    id: permission.id,
    startTime: permission.startTime.toISOString(),
    endTime: permission.endTime.toISOString(),
    status: "pending",
  });
}

/** Today's timed permissions for the caller's own active session, if any. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json({ permissions: [] });

  const permissions = await prisma.timedPermission.findMany({
    where: { attendanceId: checkIn.id },
    orderBy: { startTime: "asc" },
    include: { pause: true },
  });

  return NextResponse.json({
    permissions: permissions.map((p) => ({
      id: p.id,
      startTime: p.startTime.toISOString(),
      endTime: p.endTime.toISOString(),
      status: derivePermissionStatus(p),
    })),
  });
}

function derivePermissionStatus(permission: {
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  pause: { resumedAt: Date | null } | null;
}): "pending" | "rejected" | "scheduled" | "active" | "resolved" {
  if (permission.approvalStatus === "PENDING") return "pending";
  if (permission.approvalStatus === "REJECTED") return "rejected";
  if (!permission.pause) return "scheduled";
  return permission.pause.resumedAt ? "resolved" : "active";
}
