import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { getSettings } from "@/lib/settings";
import { computeTotalDistanceMeters } from "@/lib/locationClustering";
import { istDateKey, parseDateOnlyKey } from "@/lib/istTime";

// Field employees' own reimbursement view (mobile app, "Reimbursement" screen and the Home card).
//
// An admin saves one Reimbursement row per day after reviewing the GPS distance (see
// /api/admin/employees/[id]/reimbursement). So:
//  - a day with a saved row is APPROVED, using the saved distance, rate and amount;
//  - a past Field day with tracked distance but no saved row is IN_REVIEW, with an estimate
//    (distance x the organization's default rate) when a rate is set;
//  - today is reported separately as a live estimate.
// Distance follows the admin screen's rules: pings recorded while the day's work segment was Office are
// left out, and computeTotalDistanceMeters drops noisy readings and gaps.

const IST_OFFSET_MS = 330 * 60 * 1000; // India has no DST: a fixed +5:30

function monthRange(key: string): { start: Date; end: Date; nextKey: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const start = new Date(Date.UTC(y, mo - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(y, mo, 1) - IST_OFFSET_MS);
  const nextKey = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { start, end, nextKey };
}

const km = (meters: number) => Math.round((meters / 1000) * 10) / 10;
const rupees = (distanceKm: number, rate: number) => Math.round(distanceKm * rate);

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { workMode: true, organizationId: true },
  });
  if (!user?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.workMode !== "FIELD") return NextResponse.json({ enabled: false });

  const todayKey = istDateKey();
  const monthKey = req.nextUrl.searchParams.get("month") ?? todayKey.slice(0, 7);
  const range = monthRange(monthKey);
  if (!range) return NextResponse.json({ error: "Invalid month." }, { status: 400 });

  const settings = await getSettings(user.organizationId);
  const ratePerKm = settings.reimbursementRatePerKm ?? null;

  const rowsFrom = parseDateOnlyKey(`${monthKey}-01`);
  const rowsTo = parseDateOnlyKey(`${range.nextKey}-01`);
  const [checkIns, pings, saved] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: auth.sub, type: "CHECK_IN", timestamp: { gte: range.start, lt: range.end } },
      select: {
        timestamp: true,
        workSegments: { select: { mode: true, startedAt: true, endedAt: true } },
      },
    }),
    prisma.locationPing.findMany({
      where: { userId: auth.sub, timestamp: { gte: range.start, lt: range.end } },
      orderBy: { timestamp: "asc" },
      select: { latitude: true, longitude: true, timestamp: true, accuracy: true },
    }),
    rowsFrom && rowsTo
      ? prisma.reimbursement.findMany({
          where: { userId: auth.sub, date: { gte: rowsFrom, lt: rowsTo } },
          select: { date: true, distanceKm: true, ratePerKm: true, amount: true, note: true },
        })
      : Promise.resolve([]),
  ]);

  // Days the employee checked in, with the intervals spent as Office (not travel).
  const officeByDay = new Map<string, { from: number; to: number }[]>();
  for (const c of checkIns) {
    const key = istDateKey(c.timestamp);
    const list = officeByDay.get(key) ?? [];
    for (const s of c.workSegments) {
      if (s.mode === "OFFICE") list.push({ from: s.startedAt.getTime(), to: (s.endedAt ?? new Date()).getTime() });
    }
    officeByDay.set(key, list);
  }

  const pingsByDay = new Map<string, typeof pings>();
  for (const p of pings) {
    const key = istDateKey(p.timestamp);
    if (!officeByDay.has(key)) continue; // only days with a check-in
    const list = pingsByDay.get(key) ?? [];
    list.push(p);
    pingsByDay.set(key, list);
  }
  const distanceKmByDay = new Map<string, number>();
  for (const [key, list] of pingsByDay) {
    const office = officeByDay.get(key) ?? [];
    const field = list.filter((p) => !office.some((i) => p.timestamp.getTime() >= i.from && p.timestamp.getTime() < i.to));
    distanceKmByDay.set(key, km(computeTotalDistanceMeters(field)));
  }

  type Day = {
    date: string;
    distanceKm: number;
    ratePerKm: number | null;
    amount: number | null;
    status: "APPROVED" | "IN_REVIEW";
    estimated: boolean;
    note: string | null;
  };
  const days = new Map<string, Day>();
  for (const r of saved) {
    const key = istDateKey(r.date);
    days.set(key, {
      date: key,
      distanceKm: r.distanceKm,
      ratePerKm: r.ratePerKm,
      amount: r.amount,
      status: "APPROVED",
      estimated: false,
      note: r.note,
    });
  }
  for (const [key, distanceKm] of distanceKmByDay) {
    if (key === todayKey || days.has(key) || distanceKm < 0.1) continue;
    days.set(key, {
      date: key,
      distanceKm,
      ratePerKm,
      amount: ratePerKm !== null ? rupees(distanceKm, ratePerKm) : null,
      status: "IN_REVIEW",
      estimated: true,
      note: null,
    });
  }

  const list = [...days.values()].filter((d) => d.date !== todayKey || d.status === "APPROVED").sort((a, b) => b.date.localeCompare(a.date));
  const approvedAmount = list.filter((d) => d.status === "APPROVED").reduce((s, d) => s + (d.amount ?? 0), 0);
  const inReviewAmount = list.filter((d) => d.status === "IN_REVIEW").reduce((s, d) => s + (d.amount ?? 0), 0);
  const todayKm = distanceKmByDay.get(todayKey) ?? 0;
  const monthIsCurrent = monthKey === todayKey.slice(0, 7);

  return NextResponse.json({
    enabled: true,
    ratePerKm,
    month: monthKey,
    todayKey,
    today: {
      active: monthIsCurrent && officeByDay.has(todayKey),
      distanceKm: monthIsCurrent ? todayKm : 0,
      estimatedAmount: monthIsCurrent && ratePerKm !== null ? rupees(todayKm, ratePerKm) : null,
    },
    totals: {
      distanceKm: Math.round(list.reduce((s, d) => s + d.distanceKm, 0) * 10) / 10,
      approvedAmount,
      inReviewAmount,
      totalAmount: approvedAmount + inReviewAmount,
    },
    days: list,
  });
}
