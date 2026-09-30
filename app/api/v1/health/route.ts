import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";

/** Confirms the bearer token and its organization resolve — the "test
 * connection" endpoint the Payroll contract asks for. */
export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async (organizationId) => {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    return NextResponse.json({
      status: "ok",
      company: { id: org?.id, name: org?.name },
      apiVersion: "1.0",
      serverTime: new Date().toISOString(),
    });
  });
}
