import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, generateQrToken, hash, nextEmployeeCode } from "@/lib/credentials";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
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
    const qrToken = generateQrToken();
    const pinHash = await hash(pin);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        role: "EMPLOYEE",
        employeeCode,
        pinHash,
        qrToken,
      },
    });

    // Return the plaintext PIN once, at creation time, so the admin can hand it
    // to the employee. It is never retrievable again after this response.
    return NextResponse.json({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      pin,
    });
  } catch (err) {
    console.error("[POST /api/admin/employees] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error." },
      { status: 500 },
    );
  }
}
