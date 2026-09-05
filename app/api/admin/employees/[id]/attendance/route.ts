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
    // Explicit `select` — same reasoning as /api/mobile/me/attendance: the
    // response never sends photo bytes, only `hasPhoto`, so pulling up to
    // 2000 full presence-photo blobs per employee-history view was pure waste.
    prisma.attendance.findMany({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
      take: 2000,
      select: {
        id: true,
        type: true,
        method: true,
        timestamp: true,
        hasPhoto: true,
        faceVerifyStatus: true,
        pauses: { select: { pausedAt: true, resumedAt: true, timedPermissionId: true } },
      },
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
