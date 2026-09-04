import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { istDateKey } from "@/lib/istTime";

/** This year's public holidays — read-only reference list for the mobile
 * app's leave-request screen (so a request spanning one isn't miscounted)
 * and its own calendar. */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The IST calendar year — see lib/istTime.ts for why this can't be
  // `new Date().getFullYear()`.
  const year = Number(istDateKey().slice(0, 4));
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    holidays: holidays.map((h) => ({ id: h.id, date: h.date.toISOString(), name: h.name })),
  });
}
