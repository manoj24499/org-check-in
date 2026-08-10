import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const updateSchema = z.object({
  name: z.string().trim().max(60).nullable().optional(),
  startTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm.").optional(),
  endTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm.").optional(),
  // Full replace when present — employees left out are unassigned
  // (shiftId set to null), matching the "add/remove in one save" UI.
  employeeIds: z.array(z.string()).optional(),
});

const employeeSelect = { id: true, employeeCode: true, name: true } as const;

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

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name || null } : {}),
      ...(parsed.data.startTime !== undefined ? { startTime: parsed.data.startTime } : {}),
      ...(parsed.data.endTime !== undefined ? { endTime: parsed.data.endTime } : {}),
      ...(parsed.data.employeeIds !== undefined
        ? { employees: { set: parsed.data.employeeIds.map((employeeId) => ({ id: employeeId })) } }
        : {}),
    },
    include: { employees: { select: employeeSelect, orderBy: { name: "asc" } } },
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

  // Employees assigned to this shift are unassigned, not deleted — see
  // User.shift's onDelete: SetNull in schema.prisma.
  await prisma.shift.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
