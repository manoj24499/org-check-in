import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerError, partnerList } from "@/lib/partnerApi/response";

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** One calendar per organization, plain Jan 1 - Dec 31 (see the response
 * doc: there's no financial-year concept anywhere in this app — leave
 * quotas already run on the plain calendar year). Only WORKING and HOLIDAY
 * day types are populated; WEEKLY_OFF and OPTIONAL_HOLIDAY are never used
 * because there's no single company-wide "which days are off" setting —
 * that varies per employee via ShiftAssignment, not per organization. */
export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async (organizationId) => {
    const params = req.nextUrl.searchParams;
    const fyParam = params.get("financialYear");
    const yearMatch = fyParam ? /^\d{4}/.exec(fyParam) : null;
    if (!yearMatch) {
      return partnerError("VALIDATION_ERROR", "financialYear is required, e.g. 2026 (a plain calendar year — see notes).", {
        financialYear: "Missing or invalid",
      });
    }
    const year = Number(yearMatch[0]);
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    const [org, holidays] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      prisma.publicHoliday.findMany({
        where: { organizationId, date: { gte: start, lte: end } },
        select: { date: true, name: true, createdAt: true },
      }),
    ]);

    const holidayByDay = new Map(holidays.map((h) => [dateKey(h.date), h]));

    const days: { date: string; dayType: "WORKING" | "HOLIDAY"; holidayName: string | null; holidayType: null }[] = [];
    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      const key = dateKey(cur);
      const holiday = holidayByDay.get(key);
      days.push({ date: key, dayType: holiday ? "HOLIDAY" : "WORKING", holidayName: holiday?.name ?? null, holidayType: null });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    // PublicHoliday has no updatedAt of its own (only createdAt) — the most
    // recent addition is the closest honest signal for "when this calendar
    // last changed."
    const updatedAt = holidays.length
      ? new Date(Math.max(...holidays.map((h) => h.createdAt.getTime()))).toISOString()
      : start.toISOString();

    const data = [
      {
        calendarId: `cal_${organizationId}_${year}`,
        name: `${org?.name ?? "Company"} ${year}`,
        financialYear: String(year),
        startDate: dateKey(start),
        endDate: dateKey(end),
        timezone: "Asia/Kolkata",
        appliesTo: { allLocations: true },
        weeklyOffPattern: null,
        days,
        updatedAt,
      },
    ];

    return partnerList(data, { limit: 50, nextCursor: null, totalCount: data.length });
  });
}
