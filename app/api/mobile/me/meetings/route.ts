import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { loadShiftAssignments } from "@/lib/shiftAssignment";
import { istWeekday, isInsideShift } from "@/lib/meetings";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  startAt: z.string(),
  endAt: z.string(),
});

const MAX_DURATION_MS = 12 * 3600 * 1000;
/** Can be logged this long after it started (a meeting that overran, or one remembered late)... */
const MAX_PAST_MS = 12 * 3600 * 1000;
/** ...and this far ahead. */
const MAX_AHEAD_MS = 14 * 24 * 3600 * 1000;

function toJson(m: { id: string; title: string; startAt: Date; endAt: Date; createdAt: Date }, now = new Date()) {
  return {
    id: m.id,
    title: m.title,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
    // "upcoming": hasn't finished yet, so it can still be cancelled.
    upcoming: m.endAt > now,
  };
}

/**
 * Declares a meeting outside shift hours (before the shift starts or after it ends). Takes effect immediately,
 * no approval wait: the admin is only notified (see lib/adminNotifications.ts). A meeting that sits entirely
 * inside the employee's shift is refused, since they are already on the clock for that time.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (endAt <= startAt) return NextResponse.json({ error: "The meeting must end after it starts." }, { status: 400 });
  if (endAt.getTime() - startAt.getTime() > MAX_DURATION_MS) {
    return NextResponse.json({ error: "A meeting can be at most 12 hours long." }, { status: 400 });
  }
  const now = Date.now();
  if (startAt.getTime() < now - MAX_PAST_MS) {
    return NextResponse.json({ error: "That meeting started too long ago to log." }, { status: 400 });
  }
  if (startAt.getTime() > now + MAX_AHEAD_MS) {
    return NextResponse.json({ error: "You can only log meetings up to 14 days ahead." }, { status: 400 });
  }

  const shifts = await loadShiftAssignments(auth.sub);
  if (isInsideShift(startAt, endAt, shifts.get(istWeekday(startAt)) ?? null)) {
    return NextResponse.json(
      { error: "This meeting is during your shift, so there's nothing to log. Only meetings before or after your shift need to be added." },
      { status: 400 },
    );
  }

  const overlapping = await prisma.meeting.findFirst({
    where: { userId: auth.sub, startAt: { lt: endAt }, endAt: { gt: startAt } },
    select: { id: true },
  });
  if (overlapping) {
    return NextResponse.json({ error: "You already have a meeting logged at that time." }, { status: 409 });
  }

  const meeting = await prisma.meeting.create({
    data: { userId: auth.sub, title: parsed.data.title, startAt, endAt },
  });
  return NextResponse.json(toJson(meeting));
}

/** The caller's own meetings: the last 7 days and everything ahead, newest start first. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const meetings = await prisma.meeting.findMany({
    where: { userId: auth.sub, endAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
    orderBy: { startAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ meetings: meetings.map((m) => toJson(m, now)) });
}
