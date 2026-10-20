import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employees = await prisma.user.findMany({
    where: { organizationId: admin.organizationId, role: "EMPLOYEE", active: true },
    select: {
      id: true,
      locationPings: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });

  // Employees currently outside their working area: an open pause that came
  // from a geofence departure (not an approved timed permission).
  const openPauses = await prisma.attendancePause.findMany({
    where: {
      resumedAt: null,
      timedPermissionId: null,
      attendance: { user: { organizationId: admin.organizationId, active: true } },
    },
    select: { pausedAt: true, attendance: { select: { userId: true } } },
    orderBy: { pausedAt: "asc" },
  });
  const outsideSince = new Map<string, string>();
  for (const p of openPauses) {
    if (!outsideSince.has(p.attendance.userId)) outsideSince.set(p.attendance.userId, p.pausedAt.toISOString());
  }

  const latest = employees
    .filter((e) => e.locationPings.length > 0)
    .map((e) => {
      const ping = e.locationPings[0];
      return {
        userId: e.id,
        latitude: ping.latitude,
        longitude: ping.longitude,
        accuracy: ping.accuracy,
        timestamp: ping.timestamp.toISOString(),
        outsideSince: outsideSince.get(e.id) ?? null,
      };
    });

  return NextResponse.json(latest);
}
