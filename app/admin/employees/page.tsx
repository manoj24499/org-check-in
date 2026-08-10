import { prisma } from "@/lib/prisma";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      active: true,
    },
  });

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            Employees
          </h1>
          <p className="text-sm text-muted mt-1">
            {employees.length} total employees
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <BulkAddEmployeeForm />
          <AddEmployeeForm />
        </div>
      </div>

      <EmployeeTable employees={employees} />
    </div>
  );
}
