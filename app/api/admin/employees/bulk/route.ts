import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, generateQrToken, hash, nextEmployeeCode } from "@/lib/credentials";

const bulkCreateSchema = z.array(
  z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })
);

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bulkCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input. Ensure rows have valid name and email." }, { status: 400 });
  }

  const existingEmails = await prisma.user.findMany({
    where: { email: { in: parsed.data.map(u => u.email) } },
    select: { email: true }
  });

  if (existingEmails.length > 0) {
    return NextResponse.json({ 
      error: `Some emails are already in use: ${existingEmails.map(e => e.email).join(', ')}` 
    }, { status: 409 });
  }

  // To avoid race conditions in employeeCode generation, we'll fetch the count once
  let employeeCount = await prisma.user.count({ where: { role: "EMPLOYEE" } });

  const createdEmployees = [];

  // We loop because we need to await hash for each PIN
  for (const empData of parsed.data) {
    const employeeCode = nextEmployeeCode("EMP", employeeCount);
    employeeCount++;

    const pin = generatePin();
    const qrToken = generateQrToken();
    const pinHash = await hash(pin);

    const user = await prisma.user.create({
      data: {
        name: empData.name,
        email: empData.email,
        role: "EMPLOYEE",
        employeeCode,
        pinHash,
        qrToken,
      },
    });

    createdEmployees.push({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      pin,
    });
  }

  return NextResponse.json({
    created: createdEmployees
  });
}
