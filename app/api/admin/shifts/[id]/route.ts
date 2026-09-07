import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const updateSchema = z.object({
  name: z.string().trim().max(60).nullable().optional(),
  startTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm.").optional(),
  endTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm.").optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Checked against the *effective* (merged with whatever isn't being
  // changed) times — a partial update (e.g. renaming only) must not let a
  // stale combination slip past unchecked. endTime < startTime is a valid
  // overnight shift (see isOvernightShift in lib/shiftAssignment.ts), not an
  // error; only exact equality is.
  const effectiveStart = parsed.data.startTime ?? existing.startTime;
  const effectiveEnd = parsed.data.endTime ?? existing.endTime;
  if (effectiveStart === effectiveEnd) {
    return NextResponse.json({ error: "Start and end time can't be the same." }, { status: 400 });
  }

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name || null } : {}),
      ...(parsed.data.startTime !== undefined ? { startTime: parsed.data.startTime } : {}),
      ...(parsed.data.endTime !== undefined ? { endTime: parsed.data.endTime } : {}),
    },
    include: {
      assignments: {
        select: { weekday: true, user: { select: { id: true, employeeCode: true, name: true } } },
      },
    },
  });

  return NextResponse.json({ shift });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Every ShiftAssignment referencing this shift is cascade-deleted (see
  // ShiftAssignment.shift's onDelete: Cascade) — those employees simply have
  // no shift on the days that pointed here, same meaning as the old
  // shiftId-set-to-null unassignment.
  await prisma.shift.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
