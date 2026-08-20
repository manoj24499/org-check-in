import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const bodySchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  employeeIds: z.array(z.string()).min(1),
});

/**
 * Puts every listed employee on this shift for every listed weekday, in one
 * save — the fast path for setting up a shift across a team, as opposed to
 * the employee detail page's one-person-at-a-time weekly editor (see
 * /api/admin/employees/[id]/shift-schedule). Each (employee, weekday) pair
 * can only point at one shift, so this overwrites whatever shift (if any)
 * that employee already had on the listed days — it does not touch their
 * other days. The client is expected to warn about that before calling this
 * (see BulkAssignModal's conflict banner).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const shift = await prisma.shift.findUnique({ where: { id } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });

  const employeeCount = await prisma.user.count({ where: { id: { in: parsed.data.employeeIds } } });
  if (employeeCount !== parsed.data.employeeIds.length) {
    return NextResponse.json({ error: "One or more employees no longer exist." }, { status: 400 });
  }

  // One upsert per (employee, weekday) — replaces that slot's existing
  // assignment (to any shift) rather than erroring on the unique
  // constraint, matching the "this will replace it for those days" warning
  // the modal shows before calling this.
  await prisma.$transaction(
    parsed.data.employeeIds.flatMap((userId) =>
      parsed.data.weekdays.map((weekday) =>
        prisma.shiftAssignment.upsert({
          where: { userId_weekday: { userId, weekday } },
          create: { userId, weekday, shiftId: id },
          update: { shiftId: id },
        }),
      ),
    ),
  );

  return NextResponse.json({ ok: true });
}
