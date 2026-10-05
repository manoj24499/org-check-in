import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Page, PageHeader } from "@/components/admin/ui";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";
import { EMPLOYEES_PAGE_SIZE } from "@/lib/pagination";

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
  const [employees, total, shifts] = await Promise.all([
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
      },
    }),
    prisma.user.count({ where: { organizationId, role: "EMPLOYEE" } }),
    prisma.shift.findMany({
      where: { organizationId },
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
  ]);

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

      <EmployeeTable initialEmployees={employees} initialTotal={total} pageSize={EMPLOYEES_PAGE_SIZE} />
    </Page>
  );
}
