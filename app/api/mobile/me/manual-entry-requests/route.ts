import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { resolveManualEntryTimes } from "@/lib/manualEntry";

const bodySchema = z.object({
  date: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  reason: z.string().trim().min(3, "Please give a reason.").max(500),
});

/**
 * Employee asks an admin to record a day they worked but could not punch (e.g.
 * device problem). Does nothing until approved — see
 * /api/admin/manual-entry-requests/[id]. Last 7 days only, one open request
 * per day, and not for a day that already has a punch.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const times = resolveManualEntryTimes(parsed.data, { enforceWindow: true });
  if ("error" in times) return NextResponse.json({ error: times.error }, { status: 400 });

  const [existingPunch, openRequest] = await Promise.all([
    prisma.attendance.findFirst({ where: { userId: auth.sub, dayKey: times.dateKey }, select: { id: true } }),
    prisma.manualEntryRequest.findFirst({
      where: { userId: auth.sub, date: times.dateKey, status: "PENDING" },
      select: { id: true },
    }),
  ]);
  if (existingPunch) {
    return NextResponse.json({ error: "You already have attendance recorded for that day." }, { status: 409 });
  }
  if (openRequest) {
    return NextResponse.json({ error: "You already have a pending request for that day." }, { status: 409 });
  }

  const created = await prisma.manualEntryRequest.create({
    data: {
      userId: auth.sub,
      date: times.dateKey,
      checkInAt: times.checkInAt,
      checkOutAt: times.checkOutAt,
      reason: parsed.data.reason,
    },
  });
  return NextResponse.json({ id: created.id, date: created.date, status: created.status });
}

/** The caller's recent manual-entry requests, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.manualEntryRequest.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      date: r.date,
      checkInAt: r.checkInAt.toISOString(),
      checkOutAt: r.checkOutAt.toISOString(),
      reason: r.reason,
      status: r.status,
      reviewedByName: r.reviewedByName,
      reviewNote: r.reviewNote,
    })),
  });
}
