import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

/** Serves an employee's self-uploaded profile photo for the admin
 * employee-detail page — read-only from this side (see the schema comment
 * on User.profilePhoto: no admin upload path exists). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { profilePhoto: true },
  });

  if (!user?.profilePhoto) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(user.profilePhoto), {
    headers: {
      "Content-Type": "image/jpeg",
      // `no-store` — same reasoning as the mobile self-serve route: a
      // small avatar refetched per view is cheap, and this avoids an admin
      // seeing a stale cached photo for up to an hour after an employee
      // re-uploads one.
      "Cache-Control": "private, no-store",
    },
  });
}
