import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(Math.max(Number(searchParams.get("take")) || 30, 1), 100);
  const cursor = searchParams.get("cursor");

  // Explicit `select` — the response below never includes photo bytes (just
  // `hasPhoto`; the actual image is fetched separately, one at a time, via
  // /api/mobile/me/attendance/[id]/photo), so pulling them here on every
  // history page load was pure waste.
  const records = await prisma.attendance.findMany({
    where: { userId: auth.sub },
    orderBy: { timestamp: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      type: true,
      method: true,
      timestamp: true,
      hasPhoto: true,
      pauses: { select: { pausedAt: true, resumedAt: true } },
    },
  });

  return NextResponse.json({
    records: records.map((r) => ({
      id: r.id,
      type: r.type,
      method: r.method,
      timestamp: r.timestamp.toISOString(),
      hasPhoto: r.hasPhoto,
      pauses: r.pauses.map((p) => ({
        pausedAt: p.pausedAt.toISOString(),
        resumedAt: p.resumedAt?.toISOString() ?? null,
      })),
    })),
    nextCursor: records.length === take ? records[records.length - 1].id : null,
  });
}
