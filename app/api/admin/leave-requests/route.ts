import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

/** Leave requests for the review queue — defaults to PENDING (the "needs a
 * decision" queue) unless a specific status is asked for. */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status")?.toUpperCase();
  const status = (VALID_STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as (typeof VALID_STATUSES)[number])
    : "PENDING";

  const requests = await prisma.timeOffRequest.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, employeeCode: true, name: true } } },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      type: r.type,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
      days: r.days,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewedByName: r.reviewedByName,
      reviewNote: r.reviewNote,
      employee: r.user,
    })),
  });
}
