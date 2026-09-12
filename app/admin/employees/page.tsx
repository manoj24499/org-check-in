import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";
import { EMPLOYEES_PAGE_SIZE } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  // Only page 1 (unfiltered) is fetched server-side, for a fast first
  // paint with no client round-trip — paging/searching from here on is
  // handled by EmployeeTable itself against GET /api/admin/employees,
  // which shares this same page size (see lib/pagination.ts) and where
  // clause shape.
  const [employees, total, shifts] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE" },
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
    prisma.user.count({ where: { role: "EMPLOYEE" } }),
    prisma.shift.findMany({
      orderBy: { startTime: "asc" },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            Employees
          </h1>
          <p className="text-sm text-muted mt-1">
            {total} total employees ·{" "}
            <Link href="/admin/employees/deleted" className="text-primary font-medium hover:text-primary-dark transition-colors">
              Deleted employees
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <BulkAddEmployeeForm />
          <AddEmployeeForm shifts={shifts} />
        </div>
      </div>

      <EmployeeTable initialEmployees={employees} initialTotal={total} pageSize={EMPLOYEES_PAGE_SIZE} />
    </div>
  );
}
