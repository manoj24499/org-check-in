import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { csvField } from "@/lib/csv";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.timeOffRequest.findMany({
    orderBy: { startDate: "desc" },
    include: { user: true },
  });

  const header =
    "Employee ID,Name,Type,Start Date,End Date,Days,Status,Reason,Reviewed At,Reviewed By,Review Note\n";
  const rows = requests
    .map((r) =>
      [
        r.user.employeeCode,
        csvField(r.user.name),
        r.type,
        r.startDate.toISOString().slice(0, 10),
        r.endDate.toISOString().slice(0, 10),
        r.days,
        r.status,
        csvField(r.reason ?? ""),
        r.reviewedAt?.toISOString() ?? "",
        csvField(r.reviewedByName ?? ""),
        csvField(r.reviewNote ?? ""),
      ].join(","),
    )
    .join("\n");

  return new NextResponse(header + rows, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="leave-requests-export.csv"`,
    },
  });
}
