import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildCsv, csvField, CSV_EXPORT_ROW_CAP } from "@/lib/csv";
import { parseDateOnlyKey, endOfISTDay } from "@/lib/istTime";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const records = await prisma.attendance.findMany({
    where: from || to ? { timestamp: { ...(from ? { gte: from } : {}), ...(to ? { lte: endOfISTDay(to) } : {}) } } : undefined,
    orderBy: { timestamp: "desc" },
    include: { user: true },
    take: CSV_EXPORT_ROW_CAP,
  });

  const header = "Employee ID,Name,Email,Event,Method,Timestamp,Late (min),Leave Type";
  const rows = records.map((r) =>
    [
      r.user.employeeCode,
      csvField(r.user.name),
      r.user.email,
      r.type,
      r.method,
      r.timestamp.toISOString(),
      r.lateMinutes ?? "",
      r.leaveType,
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
