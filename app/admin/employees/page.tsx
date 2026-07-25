import { prisma } from "@/lib/prisma";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";
import EmployeeTable from "@/components/EmployeeTable";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: { id: true, employeeCode: true, name: true, email: true, active: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Employees</h1>
          <p className="text-secondary mt-1 font-medium">{employees.length} total employees</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <BulkAddEmployeeForm />
          <AddEmployeeForm />
        </div>
      </div>

      <EmployeeTable employees={employees} />
    </div>
  );
}
