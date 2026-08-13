import { prisma } from "@/lib/prisma";
import FieldWorkersPanel from "@/components/FieldWorkersPanel";

export const dynamic = "force-dynamic";

export default async function FieldWorkersPage() {
  const fieldEmployees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", active: true, workMode: "FIELD" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div>
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
          Field workers
        </h1>
        <p className="text-sm text-muted mt-1">
          {fieldEmployees.length} {fieldEmployees.length === 1 ? "employee" : "employees"} working anywhere
        </p>
      </div>

      <FieldWorkersPanel employees={fieldEmployees} />
    </div>
  );
}
