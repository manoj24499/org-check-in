import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    role: user.role,
    workMode: user.workMode,
    homeLatitude: user.homeLatitude,
    homeLongitude: user.homeLongitude,
    homeRadiusMeters: user.homeRadiusMeters,
  });
}
