import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // `photo` is omitted by the Prisma client's global default — opt back in
  // for this one lookup, matching the other photo routes' pattern. Admin can
  // view any employee's visit photo, so no ownership check like the mobile
  // route needs.
  const visit = await prisma.fieldVisit.findUnique({
    where: { id },
    omit: { photo: false },
  });

  if (!visit || !visit.photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(visit.photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
