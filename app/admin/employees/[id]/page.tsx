import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCalendarSpecialDays } from "@/lib/timeOff";
import EmployeeActions from "@/components/EmployeeActions";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import { RecentActivityList } from "@/components/RecentActivityList";
import { ArrowLeft, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

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

  const employee = await prisma.user.findUnique({
    where: { id },
    include: {
      shift: {
        select: { id: true, name: true, startTime: true, endTime: true },
      },
      attendances: {
        orderBy: { timestamp: "desc" },
        take: 2000,
        include: { pauses: true },
      },
    },
  });

  if (!employee || employee.role !== "EMPLOYEE") notFound();

  const specialDays = await getCalendarSpecialDays(employee.id);

  const attendances = employee.attendances.map((r) => ({
    id: r.id,
    type: r.type,
    method: r.method,
    timestamp: r.timestamp.toISOString(),
    hasPhoto: r.hasPhoto,
    pauses: r.pauses.map((p) => ({
      pausedAt: p.pausedAt.toISOString(),
      resumedAt: p.resumedAt?.toISOString() ?? null,
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
      </div>

      <div className="flex flex-col gap-8">
        <div className="rounded-lg border border-border bg-surface-2 p-6 shadow-[0_1px_2px_rgba(41,43,49,0.05)] ">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Credentials
          </h2>
          <EmployeeActions employeeId={employee.id} active={employee.active} />
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-6 shadow-[0_1px_2px_rgba(41,43,49,0.05)] ">
          <h2 className="text-lg font-medium text-foreground mb-4">
            Shift &amp; Lateness
          </h2>
          {employee.shift ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  {employee.shift.name || "Assigned shift"}
                </p>
                <p className="text-secondary text-sm">
                  {formatTimeLabel(employee.shift.startTime)} –{" "}
                  {formatTimeLabel(employee.shift.endTime)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-secondary text-sm font-medium">
              Not assigned to a shift — late check-ins aren&apos;t tracked for
              this employee.
            </p>
          )}
          <Link
            href="/admin/shifts"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
          >
            Manage shifts &amp; assignments →
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
          <AttendanceCalendar attendances={attendances} specialDays={specialDays} layout="split" />
        </div>
      </div>
    </div>
  );
}
