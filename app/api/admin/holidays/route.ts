import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateOnlyKey, istDateKey } from "@/lib/istTime";

/** This year's public holidays (or a given ?year=), for the holiday
 * calendar manager. */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : Number(istDateKey().slice(0, 4));
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    holidays: holidays.map((h) => ({ id: h.id, date: h.date.toISOString(), name: h.name })),
  });
}

const postSchema = z.object({
  date: z.string(),
  name: z.string().trim().min(1).max(120),
});

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const date = parseDateOnlyKey(parsed.data.date);
  if (!date) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  try {
    const holiday = await prisma.publicHoliday.create({
      data: { date, name: parsed.data.name },
    });
    return NextResponse.json({
      holiday: { id: holiday.id, date: holiday.date.toISOString(), name: holiday.name },
    });
  } catch {
    return NextResponse.json({ error: "A holiday is already set for this date." }, { status: 409 });
  }
}
