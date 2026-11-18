import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const bodySchema = z.object({
  employeeId: z.string().min(1),
  // The complete set of weekdays this employee should be on THIS shift. An empty list takes them off
  // the shift entirely.
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
});

/**
 * Sets one employee's days on this shift from the shift card (click a weekday chip, or remove the
 * employee). Each (employee, weekday) can only point at one shift, so a day newly added here replaces
 * whatever other shift the employee had that day; their other days are left alone. The bulk version for
 * a whole team is ./bulk-assign.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const shift = await prisma.shift.findFirst({ where: { id, organizationId: admin.organizationId } });
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });

  const user = await prisma.user.findFirst({
    where: { id: parsed.data.employeeId, organizationId: admin.organizationId },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const weekdays = [...new Set(parsed.data.weekdays)];
  await prisma.$transaction([
    // Clears this employee's days on this shift and any other shift on the days being set.
    prisma.shiftAssignment.deleteMany({
      where: { userId: user.id, OR: [{ shiftId: id }, { weekday: { in: weekdays } }] },
    }),
    ...(weekdays.length > 0
      ? [prisma.shiftAssignment.createMany({ data: weekdays.map((weekday) => ({ userId: user.id, weekday, shiftId: id })) })]
      : []),
  ]);

  return NextResponse.json({ ok: true, weekdays: weekdays.sort() });
}
