import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const records = await prisma.attendance.findMany({
    orderBy: { timestamp: "desc" },
    include: { user: true },
  });

  const header = "Employee ID,Name,Email,Event,Method,Timestamp\n";
  const rows = records
    .map((r) =>
      [
        r.user.employeeCode,
        `"${r.user.name.replace(/"/g, '""')}"`,
        r.user.email,
        r.type,
        r.method,
        r.timestamp.toISOString(),
      ].join(",")
    )
    .join("\n");

  return new NextResponse(header + rows, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="attendance-export.csv"`,
    },
  });
}
