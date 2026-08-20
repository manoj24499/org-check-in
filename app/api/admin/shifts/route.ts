import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createSchema = z.object({
  name: z.string().trim().max(60).optional(),
  startTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm."),
  endTime: z.string().regex(TIME_PATTERN, "Use 24-hour HH:mm."),
});

// Who's on a shift, and which weekdays, is now assigned from the employee
// detail page's weekly schedule editor (see
// /api/admin/employees/[id]/shift-schedule) rather than here — this route
// only manages the shift's own name/start/end. GET still reports the
// resulting roster (read-only) so this page can show it.
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shifts = await prisma.shift.findMany({
    orderBy: { startTime: "asc" },
    include: {
      assignments: {
        select: { weekday: true, user: { select: { id: true, employeeCode: true, name: true } } },
      },
    },
  });

  return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const shift = await prisma.shift.create({
    data: {
      name: parsed.data.name || null,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
    },
    include: {
      assignments: {
        select: { weekday: true, user: { select: { id: true, employeeCode: true, name: true } } },
      },
    },
  });

  return NextResponse.json({ shift });
}
