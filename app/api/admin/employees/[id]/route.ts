import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, generateQrToken, hash } from "@/lib/credentials";

const actionSchema = z.object({
  action: z.enum(["regenerate-pin", "regenerate-qr", "set-active"]),
  active: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      active: true,
      qrToken: true,
      createdAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ employee: user });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "regenerate-pin") {
    const pin = generatePin();
    const pinHash = await hash(pin);
    await prisma.user.update({ where: { id }, data: { pinHash } });
    return NextResponse.json({ pin });
  }

  if (parsed.data.action === "regenerate-qr") {
    const qrToken = generateQrToken();
    await prisma.user.update({ where: { id }, data: { qrToken } });
    return NextResponse.json({ qrToken });
  }

  if (parsed.data.action === "set-active") {
    await prisma.user.update({
      where: { id },
      data: { active: parsed.data.active ?? true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
