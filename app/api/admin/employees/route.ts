import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, hashPin, nextEmployeeCode } from "@/lib/credentials";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  // Optional convenience — assigns this shift for all 7 weekdays right away
  // (see ShiftAssignment) so a new OFFICE employee doesn't start with no
  // shift at all. An admin who needs a mixed weekly schedule instead can
  // still fine-tune individual days afterward from the employee's own page
  // (see ShiftScheduleEditor) — this is just a faster starting point.
  shiftId: z.string().min(1).optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      active: true,
      workMode: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use." }, { status: 409 });
    }

    let shift: { id: string; name: string | null; startTime: string; endTime: string } | null = null;
    if (parsed.data.shiftId) {
      shift = await prisma.shift.findUnique({
        where: { id: parsed.data.shiftId },
        select: { id: true, name: true, startTime: true, endTime: true },
      });
      if (!shift) {
        return NextResponse.json({ error: "Selected shift no longer exists." }, { status: 400 });
      }
    }

    // Find the highest existing employee code number to avoid collisions
    // when employees have been deleted (count would be lower than max code).
    const lastEmployee = await prisma.user.findFirst({
      where: { role: "EMPLOYEE" },
      orderBy: { employeeCode: "desc" },
      select: { employeeCode: true },
    });
    const currentMax = lastEmployee
      ? parseInt(lastEmployee.employeeCode.replace("EMP", ""), 10)
      : 0;
    const employeeCode = nextEmployeeCode("EMP", currentMax);

    const pin = generatePin();
    const pinHash = await hashPin(pin);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: "EMPLOYEE",
        employeeCode,
        pinHash,
      },
    });

    // All 7 weekdays, same shift — the quick-start default described above.
    if (shift) {
      await prisma.shiftAssignment.createMany({
        data: Array.from({ length: 7 }, (_, weekday) => ({ userId: user.id, shiftId: shift!.id, weekday })),
      });
    }

    // Return the plaintext PIN once, at creation time, so the admin can hand it
    // to the employee. It is never retrievable again after this response.
    return NextResponse.json({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      pin,
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
    });
  } catch (err) {
    console.error("[POST /api/admin/employees] Unhandled error:", err);
    // The real error (which can include DB constraint/column names or other
    // schema details) goes to the server log above — never to the client,
    // matching every other route's error handling in this app.
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
