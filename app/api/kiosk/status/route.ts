import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rateLimit";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Lightweight, PIN-less lookup so the kiosk can steer an employee to the
// right button (Check In vs Check Out) and warn them about a forgotten
// check-out before they even type their PIN.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(`status:${ip}`, 60_000, 60)) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const employeeCode = req.nextUrl.searchParams.get("employeeCode")?.trim();
  if (!employeeCode) {
    return NextResponse.json({ exists: false });
  }

  const user = await prisma.user.findUnique({ where: { employeeCode } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ exists: false });
  }

  const todaysRecords = await prisma.attendance.findMany({
    where: { userId: user.id, timestamp: { gte: startOfToday() } },
    orderBy: { timestamp: "asc" },
  });

  const checkIn = todaysRecords.find((r) => r.type === "CHECK_IN");
  const checkOut = todaysRecords.find((r) => r.type === "CHECK_OUT");

  return NextResponse.json({
    exists: true,
    name: user.name,
    workMode: user.workMode,
    checkedIn: Boolean(checkIn),
    checkedOut: Boolean(checkOut),
    checkInAt: checkIn?.timestamp ?? null,
  });
}
