import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EmployeeActions from "@/components/EmployeeActions";
import AttendanceCalendar from "@/components/AttendanceCalendar";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

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
      attendances: {
        orderBy: { timestamp: "desc" },
        take: 2000,
      },
    },
  });

  if (!employee || employee.role !== "EMPLOYEE") notFound();

  const attendances = employee.attendances.map((r) => ({
    id: r.id,
    type: r.type,
    method: r.method,
    timestamp: r.timestamp.toISOString(),
    hasPhoto: r.hasPhoto,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/employees"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Employees
        </Link>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-primary/20 shrink-0">
            {initials(employee.name)}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{employee.name}</h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${
                  employee.active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {employee.active ? "Active" : "Deactivated"}
              </span>
            </div>
            <p className="text-secondary mt-1 font-medium">
              {employee.employeeCode} &middot; {employee.email}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md p-6 shadow-xl shadow-slate-200/20">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Credentials</h2>
          <EmployeeActions employeeId={employee.id} active={employee.active} />
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Attendance Calendar</h2>
          <AttendanceCalendar attendances={attendances} />
        </div>
      </div>
    </div>
  );
}
