import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // `photo` is omitted by the Prisma client's global default — opt back in
  // for this one lookup, matching the attendance photo route's pattern.
  const visit = await prisma.fieldVisit.findUnique({
    where: { id },
    omit: { photo: false },
    include: { attendance: { select: { userId: true } } },
  });

  if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Ownership is checked before the photo-presence check below, so someone
  // else's expired-photo visit still reports Forbidden rather than Not
  // Found — don't let photo retention leak into the access-control response.
  if (visit.attendance.userId !== auth.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!visit.photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(visit.photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
