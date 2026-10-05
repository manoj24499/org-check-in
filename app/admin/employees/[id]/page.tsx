import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCalendarSpecialDays } from "@/lib/timeOff";
import EmployeeActions from "@/components/EmployeeActions";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import ShiftScheduleEditor from "@/components/ShiftScheduleEditor";
import { RecentActivityList } from "@/components/RecentActivityList";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Avatar, CARD, Page, Pill } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// Must match lib/employeeCleanup.ts's RETENTION_DAYS — duplicated here as a
// plain constant rather than importing it, since it's just one integer and
// this keeps the page from depending on the cleanup module's internals.
const DELETION_RETENTION_DAYS = 7;

const WORK_MODE_LABEL: Record<string, string> = {
  OFFICE: "Office",
  WFH: "Work from home",
  FIELD: "Field",
};

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  // Explicit `select` on the attendances relation — same egress-audit fix as
  // my-page/api/admin/employees/[id]/attendance: this was pulling up to 2000
  // full Attendance rows (photo bytes included) per employee-detail-page
  // view, and the RecentActivityList/AttendanceCalendar below never render
  // photo bytes directly (only `hasPhoto`).
  // Scoped to the admin's own organization — not found (rather than someone
  // else's data) if this id belongs to a different org.
  const employee = await prisma.user.findUnique({
    where: { id, organizationId: session.user.organizationId },
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
    getCalendarSpecialDays(employee.id, session.user.organizationId),
    prisma.shiftAssignment.findMany({
      where: { userId: employee.id },
      select: { weekday: true, shiftId: true },
    }),
    prisma.shift.findMany({
      where: { organizationId: session.user.organizationId },
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
    <Page>
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/employees"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Employees
        </Link>

        <div className={`${CARD} overflow-hidden`}>
          <div className="h-24 bg-[#1d1f26] bg-[radial-gradient(420px_160px_at_85%_-20%,rgba(240,100,0,0.55),transparent_70%),radial-gradient(300px_120px_at_0%_120%,rgba(99,102,241,0.35),transparent_70%)]" />
          <div className="px-6 pb-6">
            <div className="-mt-11 flex flex-wrap items-start gap-x-5 gap-y-3">
              {employee.hasProfilePhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/admin/employees/${employee.id}/profile-photo`}
                  alt={employee.name}
                  className="h-[88px] w-[88px] shrink-0 rounded-2xl object-cover shadow-md ring-4 ring-white"
                />
              ) : (
                <span className="rounded-2xl shadow-md ring-4 ring-white">
                  <Avatar name={employee.name} size={88} />
                </span>
              )}
              <div className="min-w-0 sm:mt-[52px]">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="break-words text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-900">
                    {employee.name}
                  </h1>
                  <Pill tone={employee.active ? "green" : "slate"} dot>
                    {employee.active ? "Active" : "Deactivated"}
                  </Pill>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                  <span className="font-mono text-[13px] text-slate-600">{employee.employeeCode}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="break-all">{employee.email}</span>
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2 sm:mt-[56px]">
                <Pill tone="indigo">{WORK_MODE_LABEL[employee.workMode] ?? employee.workMode}</Pill>
                {employee.faceVerificationEnabled && <Pill tone="green">Face verification on</Pill>}
              </div>
            </div>
          </div>
        </div>

        {!employee.active && employee.deactivatedAt && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)]">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-slate-900">
            Credentials
          </h2>
          <EmployeeActions
            employeeId={employee.id}
            active={employee.active}
            faceVerificationEnabled={employee.faceVerificationEnabled}
            faceVerificationExempt={employee.faceVerificationExempt}
          />
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)]">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-slate-900">
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

        <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)] p-6">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-slate-900">
            Recent Activity
          </h2>
          <RecentActivityList records={attendances} />
        </div>

        <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)] p-6">
          <h2 className="mb-4 text-[16px] font-semibold tracking-[-0.01em] text-slate-900">
            Attendance Calendar
          </h2>
          <AttendanceCalendar attendances={attendances} specialDays={specialDays} layout="split" editable />
        </div>
      </div>
    </Page>
  );
}
