import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { computeSegmentSplit } from "@/lib/attendanceHours";

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
      // FIELD (Office/Field) and HYBRID (Office/Transit/Home) timelines; empty otherwise.
      workSegments: {
        orderBy: { startedAt: "asc" },
        select: { mode: true, heading: true, startedAt: true, endedAt: true },
      },
    },
  });

  // Per-type minutes for a HYBRID check-in: up to its check-out, or up to now while still open.
  // Transit isn't work time — the app should leave it out of the day's hours.
  const hybridIds = records
    .filter((r) => r.type === "CHECK_IN" && r.workSegments.some((s) => s.mode === "HOME" || s.mode === "TRANSIT"))
    .map((r) => r.id);
  const checkOutAfter = new Map<string, Date>();
  if (hybridIds.length > 0) {
    for (const r of records) {
      if (r.type !== "CHECK_IN" || !hybridIds.includes(r.id)) continue;
      const out = await prisma.attendance.findFirst({
        where: { userId: auth.sub, type: "CHECK_OUT", timestamp: { gt: r.timestamp } },
        orderBy: { timestamp: "asc" },
        select: { timestamp: true },
      });
      if (out) checkOutAfter.set(r.id, out.timestamp);
    }
  }

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
      segments: r.workSegments.map((s) => ({
        mode: s.mode,
        heading: s.heading,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
      })),
      // HYBRID check-ins only, else null.
      segmentMinutes: hybridIds.includes(r.id)
        ? (() => {
            const split = computeSegmentSplit(r.timestamp, checkOutAfter.get(r.id) ?? new Date(), r.workSegments, r.pauses);
            return {
              officeMinutes: Math.round(split.officeMs / 60_000),
              homeMinutes: Math.round(split.homeMs / 60_000),
              transitMinutes: Math.round(split.transitMs / 60_000),
            };
          })()
        : null,
    })),
    nextCursor: records.length === take ? records[records.length - 1].id : null,
  });
}
