import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// One row per weekday that actually has a shift assigned — a weekday left
// out of the payload means "no shift that day", same meaning as the old
// null shiftId (see prisma/schema.prisma's ShiftAssignment comment).
const putSchema = z.object({
  assignments: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        shiftId: z.string().min(1),
      }),
    )
    .max(7),
});

/** The employee's weekly shift schedule, plus every shift available to
 * assign — fetched together since the editor always needs both. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [assignments, shifts] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { userId: id },
      select: { weekday: true, shiftId: true },
      orderBy: { weekday: "asc" },
    }),
    prisma.shift.findMany({
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
  ]);

  return NextResponse.json({ assignments, shifts });
}

/**
 * Full replace of this employee's weekly schedule — the editor always sends
 * its complete 7-slot state in one save, same "add/remove in one save"
 * pattern the old shift-employees picker used.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const weekdays = parsed.data.assignments.map((a) => a.weekday);
  if (new Set(weekdays).size !== weekdays.length) {
    return NextResponse.json({ error: "Each day can only have one shift." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const shiftIds = [...new Set(parsed.data.assignments.map((a) => a.shiftId))];
  if (shiftIds.length > 0) {
    const validCount = await prisma.shift.count({ where: { id: { in: shiftIds } } });
    if (validCount !== shiftIds.length) {
      return NextResponse.json({ error: "One or more shifts no longer exist." }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { userId: id } }),
    ...(parsed.data.assignments.length > 0
      ? [
          prisma.shiftAssignment.createMany({
            data: parsed.data.assignments.map((a) => ({ userId: id, shiftId: a.shiftId, weekday: a.weekday })),
          }),
        ]
      : []),
  ]);

  const assignments = await prisma.shiftAssignment.findMany({
    where: { userId: id },
    select: { weekday: true, shiftId: true },
    orderBy: { weekday: "asc" },
  });

  return NextResponse.json({ assignments });
}
