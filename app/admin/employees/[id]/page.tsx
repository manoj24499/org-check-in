import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCalendarSpecialDays } from "@/lib/timeOff";
import EmployeeActions from "@/components/EmployeeActions";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import ShiftScheduleEditor from "@/components/ShiftScheduleEditor";
import { RecentActivityList } from "@/components/RecentActivityList";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

// Must match lib/employeeCleanup.ts's RETENTION_DAYS — duplicated here as a
// plain constant rather than importing it, since it's just one integer and
// this keeps the page from depending on the cleanup module's internals.
const DELETION_RETENTION_DAYS = 7;

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Explicit `select` on the attendances relation — same egress-audit fix as
  // my-page/api/admin/employees/[id]/attendance: this was pulling up to 2000
  // full Attendance rows (photo bytes included) per employee-detail-page
  // view, and the RecentActivityList/AttendanceCalendar below never render
  // photo bytes directly (only `hasPhoto`).
  const employee = await prisma.user.findUnique({
    where: { id },
    include: {
      attendances: {
        orderBy: { timestamp: "desc" },
        take: 2000,
        select: {
          id: true,
          type: true,
          method: true,
          timestamp: true,
          hasPhoto: true,
          faceVerifyStatus: true,
          pauses: { select: { pausedAt: true, resumedAt: true, timedPermissionId: true } },
        },
      },
    },
  });
  // `include` above already brings back every scalar column (deactivatedAt
  // included) alongside the relation — no separate select needed.

  if (!employee || employee.role !== "EMPLOYEE") notFound();

  const [specialDays, shiftAssignments, shifts] = await Promise.all([
    getCalendarSpecialDays(employee.id),
    prisma.shiftAssignment.findMany({
      where: { userId: employee.id },
      select: { weekday: true, shiftId: true },
    }),
    prisma.shift.findMany({
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
  ]);

  const attendances = employee.attendances.map((r) => ({
    id: r.id,
    type: r.type,
    method: r.method,
    timestamp: r.timestamp.toISOString(),
    hasPhoto: r.hasPhoto,
    faceVerifyStatus: r.faceVerifyStatus,
    pauses: r.pauses.map((p) => ({
      pausedAt: p.pausedAt.toISOString(),
      resumedAt: p.resumedAt?.toISOString() ?? null,
      reason: p.timedPermissionId ? ("permission" as const) : ("geofence" as const),
    })),
  }));

  return (
    <div className="flex flex-col gap-6 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/employees"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Employees
        </Link>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg bg-primary text-white flex items-center justify-center text-lg font-medium shadow-[0_1px_2px_rgba(41,43,49,0.05)] shrink-0">
            {initials(employee.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-medium text-foreground tracking-tight break-words">
                {employee.name}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${
                  employee.active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-surface text-muted border border-border"
                }`}
              >
                {employee.active ? "Active" : "Deactivated"}
              </span>
            </div>
            <p className="text-secondary mt-1 font-medium break-words">
              {employee.employeeCode} &middot; {employee.email}
            </p>
          </div>
        </div>

        {!employee.active && employee.deactivatedAt && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Deactivated on{" "}
              {employee.deactivatedAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}.
              Unless reactivated first, this employee and their attendance/reimbursement/leave history will be{" "}
              <strong>permanently deleted</strong> on{" "}
              {new Date(
                employee.deactivatedAt.getTime() + DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
              ).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}{" "}
              (a CSV snapshot is kept — see{" "}
              <Link href="/admin/employees/deleted" className="font-semibold underline hover:no-underline">
                Deleted employees
              </Link>
              ).
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-8">
        <div className="rounded-lg border border-border bg-surface-2 p-6 shadow-[0_1px_2px_rgba(41,43,49,0.05)] ">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Credentials
          </h2>
          <EmployeeActions
            employeeId={employee.id}
            active={employee.active}
            faceVerificationEnabled={employee.faceVerificationEnabled}
            faceVerificationExempt={employee.faceVerificationExempt}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-6 shadow-[0_1px_2px_rgba(41,43,49,0.05)] ">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Shift &amp; Lateness
          </h2>
          <p className="text-secondary text-sm mb-4">
            A day left as &quot;No shift&quot; isn&apos;t tracked for lateness.
          </p>
          <ShiftScheduleEditor
            userId={employee.id}
            shifts={shifts}
            initialAssignments={shiftAssignments}
          />
          <Link
            href="/admin/shifts"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
          >
            Manage shift definitions →
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Recent Activity
          </h2>
          <RecentActivityList records={attendances} />
        </div>

        <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Attendance Calendar
          </h2>
          <AttendanceCalendar attendances={attendances} specialDays={specialDays} layout="split" editable />
        </div>
      </div>
    </div>
  );
}
