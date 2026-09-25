import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const putSchema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(1).max(100_000),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const officeLocation = await prisma.officeLocation.findUnique({
    where: { organizationId: admin.organizationId },
  });

  return NextResponse.json({ officeLocation });
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    }

    const officeLocation = await prisma.officeLocation.upsert({
      where: { organizationId: admin.organizationId },
      create: { organizationId: admin.organizationId, ...parsed.data },
      update: parsed.data,
    });

    return NextResponse.json({ officeLocation });
  } catch (err) {
    console.error("[PUT /api/admin/office-location] Unhandled error:", err);
    // The real error (which can include DB constraint/column names or other
    // schema details) goes to the server log above — never to the client,
    // matching every other route's error handling in this app.
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
