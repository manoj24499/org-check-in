import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

// The employee's own late check-ins (read-only): days the server marked a check-in as Permission
// (late, within the threshold) or Half-day leave (late beyond it) — see computeLateness in
// lib/shiftTime.ts. Shown in the mobile Requests > Permission tab for reference. These are NOT permission
// windows (TimedPermission) and have no effect on the work clock.
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 30, 1), 100);

  const rows = await prisma.attendance.findMany({
    where: { userId: auth.sub, type: "CHECK_IN", leaveType: { not: "NONE" } },
    orderBy: { timestamp: "desc" },
    take,
    select: { id: true, timestamp: true, lateMinutes: true, leaveType: true },
  });

  return NextResponse.json({
    arrivals: rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.toISOString(),
      lateMinutes: r.lateMinutes,
      leaveType: r.leaveType,
    })),
  });
}
