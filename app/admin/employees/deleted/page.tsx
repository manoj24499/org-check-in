import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Page, PageHeader } from "@/components/admin/ui";

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
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  const archives = await prisma.deletedEmployeeArchive.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { deletedAt: "desc" },
  });

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/employees"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Employees
        </Link>
        <PageHeader
          eyebrow="Workforce"
          title="Deleted employees"
          subtitle="Employees left deactivated for 7 days are permanently deleted automatically. Their record is gone, but a CSV snapshot of attendance, reimbursements, and leave requests is kept here indefinitely."
        />
      </div>

      <div className="rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.14)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-slate-500 text-left border-b border-slate-100">
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
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
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
    </Page>
  );
}
