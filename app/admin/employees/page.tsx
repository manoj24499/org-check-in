import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddEmployeeForm from "@/components/AddEmployeeForm";
import BulkAddEmployeeForm from "@/components/BulkAddEmployeeForm";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Employees</h1>
          <p className="text-secondary mt-1 font-medium">{employees.length} total employees</p>
        </div>
        <div className="flex gap-3">
          <BulkAddEmployeeForm />
          <AddEmployeeForm />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-secondary text-left border-b border-slate-200/60">
            <tr>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">ID</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Name</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Email</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Status</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100/80">
            {employees.map((emp) => (
              <tr key={emp.id} className="hover:bg-primary/5 transition-colors duration-200">
                <td className="px-6 py-4 font-medium text-slate-700">{emp.employeeCode}</td>
                <td className="px-6 py-4 text-slate-800 font-semibold">{emp.name}</td>
                <td className="px-6 py-4 text-secondary">{emp.email}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${
                      emp.active
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {emp.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/admin/employees/${emp.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                  No employees found. Add some to get started!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
