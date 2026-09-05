import { prisma } from "@/lib/prisma";
import ShiftTable from "@/components/ShiftTable";

export const dynamic = "force-dynamic";

// Shifts apply to every workMode (see the query below) — lateness
// enforcement is OFFICE-only (computeLateness), but a shift's end time also
// drives the shift-end reminder push and stale-checkin auto-checkout for
// everyone with one assigned, regardless of workMode.
export default async function ShiftsPage() {
  const [shifts, employees] = await Promise.all([
    prisma.shift.findMany({
      orderBy: { startTime: "asc" },
      include: {
        assignments: {
          select: { weekday: true, user: { select: { id: true, employeeCode: true, name: true } } },
        },
      },
    }),
    // Open to every workMode, not just OFFICE — shift-based *lateness*
    // enforcement stays OFFICE-only (see computeLateness in lib/shiftTime.ts),
    // but a shift's end time also now drives the shift-end reminder push and
    // the stale-checkin auto-checkout (see /api/kiosk/location and
    // /api/kiosk/scan), both of which apply to WFH/FIELD employees too.
    prisma.user.findMany({
      where: { role: "EMPLOYEE", active: true },
      orderBy: { name: "asc" },
      select: { id: true, employeeCode: true, name: true },
    }),
  ]);

  return <ShiftTable shifts={shifts} allEmployees={employees} />;
}
