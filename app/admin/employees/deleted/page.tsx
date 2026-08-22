import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WORK_MODE_LABEL: Record<string, string> = {
  OFFICE: "Office",
  WFH: "Home",
  FIELD: "Anywhere",
};

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Read-only record of every employee lib/employeeCleanup.ts has permanently
 * deleted (7+ days after deactivation) — the only place their history
 * survives, since the delete itself cascades their User row away. Each
 * archive holds a CSV snapshot of attendance/reimbursements/leave requests,
 * taken in the same transaction as the delete (see DeletedEmployeeArchive).
 */
export default async function DeletedEmployeesPage() {
  const archives = await prisma.deletedEmployeeArchive.findMany({
    orderBy: { deletedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/employees"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Employees
        </Link>
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            Deleted employees
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Employees left deactivated for 7 days are permanently deleted automatically. Their record is gone, but a
            CSV snapshot of attendance, reimbursements, and leave requests is kept here indefinitely.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-secondary text-left border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Employee</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Work mode</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Deactivated</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Deleted</th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Snapshots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {archives.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-foreground whitespace-nowrap">{a.name}</p>
                    <p className="text-xs text-secondary mt-0.5">
                      {a.employeeCode} &middot; {a.email}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-secondary whitespace-nowrap">
                    {WORK_MODE_LABEL[a.workMode] ?? a.workMode}
                  </td>
                  <td className="px-6 py-4 text-secondary whitespace-nowrap">{formatDate(a.deactivatedAt)}</td>
                  <td className="px-6 py-4 text-secondary whitespace-nowrap">{formatDate(a.deletedAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["attendance", "Attendance"],
                          ["reimbursements", "Reimbursements"],
                          ["leave-requests", "Leave requests"],
                        ] as const
                      ).map(([kind, label]) => (
                        <a
                          key={kind}
                          href={`/api/admin/employees/deleted/${a.id}/${kind}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {label}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {archives.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                    No employees have been deleted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
