import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const CSV_FIELD_BY_KIND = {
  attendance: "attendanceCsv",
  reimbursements: "reimbursementCsv",
  "leave-requests": "leaveRequestsCsv",
} as const;

/** Downloads one of the three CSV snapshots kept for a permanently-deleted
 * employee — see lib/employeeCleanup.ts, which is the only thing that ever
 * creates a DeletedEmployeeArchive row. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, kind } = await params;
  if (!(kind in CSV_FIELD_BY_KIND)) {
    return NextResponse.json({ error: "Unknown export kind." }, { status: 400 });
  }
  const field = CSV_FIELD_BY_KIND[kind as keyof typeof CSV_FIELD_BY_KIND];

  const archive = await prisma.deletedEmployeeArchive.findUnique({ where: { id } });
  if (!archive) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(archive[field], {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${archive.employeeCode}-${kind}.csv"`,
    },
  });
}
