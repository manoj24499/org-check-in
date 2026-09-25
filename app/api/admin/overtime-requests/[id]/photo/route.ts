import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // `photo` is omitted by the Prisma client's global default (see
  // lib/prisma.ts) — opt back in for this one lookup, matching the other
  // photo routes' pattern.
  const request = await prisma.overtimeRequest.findFirst({
    where: { id, attendance: { user: { organizationId: admin.organizationId } } },
    omit: { photo: false },
  });

  if (!request || !request.photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(request.photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
