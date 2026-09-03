import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getCalendarSpecialDays } from "@/lib/timeOff";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [attendances, specialDays] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
      take: 2000,
      include: { pauses: true },
    }),
    getCalendarSpecialDays(id),
  ]);

  return NextResponse.json({
    attendances: attendances.map((r) => ({
      id: r.id,
      type: r.type,
      method: r.method,
      timestamp: r.timestamp.toISOString(),
      hasPhoto: r.hasPhoto,
      faceVerifyStatus: r.faceVerifyStatus,
      pauses: r.pauses.map((p) => ({
        pausedAt: p.pausedAt.toISOString(),
        resumedAt: p.resumedAt?.toISOString() ?? null,
        reason: p.timedPermissionId ? ("permission" as const) : ("geofence" as const),
      })),
    })),
    specialDays,
  });
}
