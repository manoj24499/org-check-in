import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Page, PageHeader } from "@/components/admin/ui";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";
import { EMPLOYEES_PAGE_SIZE } from "@/lib/pagination";
import { trialState, TRIAL_EMPLOYEE_LIMIT } from "@/lib/trial";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  // Only page 1 (unfiltered) is fetched server-side, for a fast first
  // paint with no client round-trip — paging/searching from here on is
  // handled by EmployeeTable itself against GET /api/admin/employees,
  // which shares this same page size (see lib/pagination.ts) and where
  // clause shape.
  const [employees, total, shifts, org, activeCount] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, role: "EMPLOYEE" },
      // Join order (oldest first) rather than alphabetical — employeeCode
      // is allocated sequentially at creation (see allocateNextEmployeeCode)
      // but createdAt is the more direct, unambiguous signal for "who
      // joined first."
      orderBy: { createdAt: "asc" },
      take: EMPLOYEES_PAGE_SIZE,
      select: {
        id: true,
        employeeCode: true,
        name: true,
        email: true,
        active: true,
        workMode: true,
      },
    }),
    prisma.user.count({ where: { organizationId, role: "EMPLOYEE" } }),
    prisma.shift.findMany({
      where: { organizationId },
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { isTrial: true, trialEndsAt: true, planTier: true },
    }),
    prisma.user.count({ where: { organizationId, role: "EMPLOYEE", active: true } }),
  ]);
  // Free-trial orgs are capped (see checkTrialEmployeeLimit); say so up front instead of at the 6th add.
  const onTrial = org ? trialState(org).onTrial : false;
  const atLimit = activeCount >= TRIAL_EMPLOYEE_LIMIT;

  return (
    <Page>
      <PageHeader
        eyebrow="Workforce"
        title="Employees"
        subtitle={
          <>
            Manage everyone on your team ·{" "}
            <Link href="/admin/employees/deleted" className="font-medium text-orange-600 transition-colors hover:text-orange-700">
              Deleted employees
            </Link>
          </>
        }
        actions={
          <>
            <BulkAddEmployeeForm />
            <AddEmployeeForm shifts={shifts} />
          </>
        }
      />

      {onTrial && (
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3 text-[13px] ${
            atLimit ? "border-amber-300 bg-amber-50 text-amber-900" : "border-border bg-surface text-muted"
          }`}
        >
          <span className="font-semibold text-foreground">
            Free trial: {Math.min(activeCount, TRIAL_EMPLOYEE_LIMIT)} of {TRIAL_EMPLOYEE_LIMIT} employees
          </span>
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-border-soft">
            <span
              className={`block h-full rounded-full ${atLimit ? "bg-amber-500" : "bg-orange-500"}`}
              style={{ width: `${Math.min(100, (activeCount / TRIAL_EMPLOYEE_LIMIT) * 100)}%` }}
            />
          </span>
          <span>
            {atLimit
              ? "You've reached the trial limit, so you can't add more employees."
              : `You can add ${TRIAL_EMPLOYEE_LIMIT - activeCount} more.`}
          </span>
          <Link href="/plans" className="ml-auto font-semibold text-orange-600 hover:text-orange-700">
            {atLimit ? "Choose a plan to add more →" : "See plans"}
          </Link>
        </div>
      )}

      <EmployeeTable initialEmployees={employees} initialTotal={total} pageSize={EMPLOYEES_PAGE_SIZE} />
    </Page>
  );
}
