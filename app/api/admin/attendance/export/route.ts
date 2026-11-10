import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildCsv, csvField, CSV_EXPORT_ROW_CAP } from "@/lib/csv";
import { parseDateOnlyKey, endOfISTDay } from "@/lib/istTime";
import { computeSegmentSplit, computeWorkedMs } from "@/lib/attendanceHours";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional scoping — an admin can request just a date range (e.g. "this
  // year's payroll cycle") instead of the full, ever-growing table. Omitted
  // entirely, this still exports everything (unchanged default behavior),
  // just capped at CSV_EXPORT_ROW_CAP as a last-resort safety net.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? parseDateOnlyKey(fromParam) : null;
  const to = toParam ? parseDateOnlyKey(toParam) : null;
  if ((fromParam && !from) || (toParam && !to)) {
    return NextResponse.json({ error: "Invalid from/to date." }, { status: 400 });
  }

  // Explicit `select` — a CSV is plain text, so pulling full rows (photo
  // bytes included) and the full related `user` row (pinHash included) for
  // every one of up to CSV_EXPORT_ROW_CAP records was pure waste; a query
  // this unbounded-by-default is exactly the kind of place a wasted-bytes
  // pattern like that adds up fastest.
  const records = await prisma.attendance.findMany({
    where: {
      user: { organizationId: admin.organizationId },
      ...(from || to
        ? { timestamp: { ...(from ? { gte: from } : {}), ...(to ? { lte: endOfISTDay(to) } : {}) } }
        : {}),
    },
    orderBy: { timestamp: "desc" },
    select: {
      type: true,
      method: true,
      timestamp: true,
      lateMinutes: true,
      leaveType: true,
      userId: true,
      // For the worked/office/home/transit minutes on each CHECK_OUT row.
      pauses: { select: { pausedAt: true, resumedAt: true } },
      workSegments: { select: { mode: true, startedAt: true, endedAt: true } },
      user: { select: { employeeCode: true, name: true, email: true } },
    },
    take: CSV_EXPORT_ROW_CAP,
  });

  // Worked minutes go on each CHECK_OUT row, paired with that employee's
  // check-in just before it (rows are newest first, so it's the next older
  // CHECK_IN row of the same user). Transit time (HYBRID) isn't counted as
  // work; Office/Home/Transit minutes are filled for HYBRID days only.
  const minutesByCheckOut = new Map<number, string[]>();
  // Oldest to newest, remembering each employee's latest row so far.
  const previousByUser = new Map<string, (typeof records)[number]>();
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    const checkIn = previousByUser.get(r.userId);
    previousByUser.set(r.userId, r);
    if (r.type !== "CHECK_OUT" || !checkIn || checkIn.type !== "CHECK_IN") continue;
    const worked = Math.round(
      computeWorkedMs(checkIn.timestamp, r.timestamp, checkIn.pauses, checkIn.workSegments) / 60_000,
    );
    const hybrid = checkIn.workSegments.some((s) => s.mode === "HOME" || s.mode === "TRANSIT");
    if (!hybrid) {
      minutesByCheckOut.set(i, [String(worked), "", "", ""]);
      continue;
    }
    const split = computeSegmentSplit(checkIn.timestamp, r.timestamp, checkIn.workSegments, checkIn.pauses);
    minutesByCheckOut.set(i, [
      String(worked),
      String(Math.round(split.officeMs / 60_000)),
      String(Math.round(split.homeMs / 60_000)),
      String(Math.round(split.transitMs / 60_000)),
    ]);
  }

  const header =
    "Employee ID,Name,Email,Event,Method,Timestamp,Late (min),Leave Type,Worked (min),Office (min),Home (min),Transit (min)";
  const rows = records.map((r, i) =>
    [
      r.user.employeeCode,
      csvField(r.user.name),
      r.user.email,
      r.type,
      r.method,
      r.timestamp.toISOString(),
      r.lateMinutes ?? "",
      r.leaveType,
      ...(minutesByCheckOut.get(i) ?? ["", "", "", ""]),
    ].join(","),
  );
  const csv = buildCsv(header, rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="attendance-export.csv"`,
    },
  });
}
