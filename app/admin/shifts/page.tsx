import { prisma } from "@/lib/prisma";
import ShiftTable from "@/components/ShiftTable";

export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  const [shifts, officeEmployees] = await Promise.all([
    prisma.shift.findMany({
      orderBy: { startTime: "asc" },
      include: {
        assignments: {
          select: { weekday: true, user: { select: { id: true, employeeCode: true, name: true } } },
        },
      },
    }),
    // Shift-based lateness only applies to OFFICE employees (see
    // /api/kiosk/scan) — WFH/Anywhere workers aren't offered in bulk assign.
    prisma.user.findMany({
      where: { role: "EMPLOYEE", active: true, workMode: "OFFICE" },
      orderBy: { name: "asc" },
      select: { id: true, employeeCode: true, name: true },
    }),
  ]);

  return <ShiftTable shifts={shifts} allEmployees={officeEmployees} />;
}
