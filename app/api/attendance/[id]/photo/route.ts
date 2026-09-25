import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // `photo` is omitted by the Prisma client's global default — opt back in
  // for this one lookup, since it's the only place the bytes are ever read.
  // Includes the owning user's organizationId so an admin's access below can
  // be scoped to their own organization, not every organization's records.
  const record = await prisma.attendance.findUnique({
    where: { id },
    omit: { photo: false },
    include: { user: { select: { id: true, organizationId: true } } },
  });

  if (!record || !record.photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwnRecord = session.user.id === record.user.id;
  const isSameOrgAdmin =
    session.user.role === "ADMIN" && session.user.organizationId === record.user.organizationId;
  if (!isOwnRecord && !isSameOrgAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return new NextResponse(new Uint8Array(record.photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
