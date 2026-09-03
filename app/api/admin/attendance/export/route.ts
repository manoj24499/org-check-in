import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { buildCsv, csvField } from "@/lib/csv";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await prisma.attendance.findMany({
    orderBy: { timestamp: "desc" },
    include: { user: true },
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
