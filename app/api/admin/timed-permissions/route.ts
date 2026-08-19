import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

/** Timed-permission requests for the review queue — defaults to PENDING
 * (the "needs a decision" queue an admin actually acts on) unless a
 * specific status is asked for. */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status")?.toUpperCase();
  const approvalStatus = (VALID_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as (typeof VALID_STATUSES)[number])
    : "PENDING";

  const permissions = await prisma.timedPermission.findMany({
    where: { approvalStatus },
    orderBy: { createdAt: "asc" },
    include: {
      attendance: {
        select: {
          timestamp: true,
          user: { select: { id: true, employeeCode: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    permissions: permissions.map((p) => ({
      id: p.id,
      startTime: p.startTime.toISOString(),
      endTime: p.endTime.toISOString(),
      createdAt: p.createdAt.toISOString(),
      approvalStatus: p.approvalStatus,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
      reviewedByName: p.reviewedByName,
      employee: {
        id: p.attendance.user.id,
        employeeCode: p.attendance.user.employeeCode,
        name: p.attendance.user.name,
      },
      attendanceDate: p.attendance.timestamp.toISOString(),
    })),
  });
}
