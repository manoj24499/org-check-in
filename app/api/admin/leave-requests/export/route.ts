import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { csvField, CSV_EXPORT_ROW_CAP } from "@/lib/csv";
import { parseDateOnlyKey } from "@/lib/istTime";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional scoping — same convention as the attendance export (see its
  // own comment): omitted, this still exports everything, just capped at
  // CSV_EXPORT_ROW_CAP as a safety net against unbounded growth.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? parseDateOnlyKey(fromParam) : null;
  const to = toParam ? parseDateOnlyKey(toParam) : null;
  if ((fromParam && !from) || (toParam && !to)) {
    return NextResponse.json({ error: "Invalid from/to date." }, { status: 400 });
  }

  const requests = await prisma.timeOffRequest.findMany({
    where: from || to ? { startDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : undefined,
    orderBy: { startDate: "desc" },
    include: { user: true },
    take: CSV_EXPORT_ROW_CAP,
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
