import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

/** Lists employee-submitted support tickets for /admin/support — photo
 * bytes are never pulled here (see the global omit default on
 * lib/prisma.ts), only the `hasPhoto` flag; the dedicated
 * /api/admin/support/[id]/photo route serves the actual image when needed. */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");

  const tickets = await prisma.supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      message: true,
      hasPhoto: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      adminNote: true,
      user: { select: { id: true, employeeCode: true, name: true } },
    },
  });

  return NextResponse.json({ tickets });
}
