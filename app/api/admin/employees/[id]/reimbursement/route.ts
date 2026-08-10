import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

const putSchema = z.object({
  date: z.string(),
  distanceKm: z.number().min(0),
  ratePerKm: z.number().min(0),
  amount: z.number().min(0),
  note: z.string().trim().max(500).optional(),
});

// One row per employee per day — admin reviews the distance-suggested
// amount on the Field workers panel and saves it here, snapshotting the
// rate actually used so a later change to the default rate never rewrites
// history (see AppSettings.reimbursementRatePerKm).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const day = parseDateParam(req.nextUrl.searchParams.get("date"));

  const reimbursement = await prisma.reimbursement.findUnique({
    where: { userId_date: { userId: id, date: startOfDay(day) } },
  });

  return NextResponse.json({ reimbursement });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const date = startOfDay(parseDateParam(parsed.data.date));

  const reimbursement = await prisma.reimbursement.upsert({
    where: { userId_date: { userId: id, date } },
    update: {
      distanceKm: parsed.data.distanceKm,
      ratePerKm: parsed.data.ratePerKm,
      amount: parsed.data.amount,
      note: parsed.data.note ?? null,
    },
    create: {
      userId: id,
      date,
      distanceKm: parsed.data.distanceKm,
      ratePerKm: parsed.data.ratePerKm,
      amount: parsed.data.amount,
      note: parsed.data.note ?? null,
    },
  });

  return NextResponse.json({ reimbursement });
}
