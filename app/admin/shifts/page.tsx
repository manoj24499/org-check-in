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
          select: {
            weekday: true,
            user: { select: { id: true, employeeCode: true, name: true, createdAt: true } },
          },
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
      // Join order (oldest first), matching /admin/employees — see that
      // page's comment for why createdAt over employeeCode/name.
      orderBy: { createdAt: "asc" },
      select: { id: true, employeeCode: true, name: true },
    }),
  ]);

  // ISO-stringify createdAt explicitly for the client component's prop
  // type — Next.js serializes Date props across the server/client boundary
  // at runtime regardless, but that's invisible to the type-checker.
  const shiftsForClient = shifts.map((s) => ({
    ...s,
    assignments: s.assignments.map((a) => ({
      ...a,
      user: { ...a.user, createdAt: a.user.createdAt.toISOString() },
    })),
  }));

  return <ShiftTable shifts={shiftsForClient} allEmployees={employees} />;
}
