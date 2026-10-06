import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FieldWorkersPanel from "@/components/FieldWorkersPanel";
import FieldExportDialog from "@/components/FieldExportDialog";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function FieldWorkersPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  const fieldEmployees = await prisma.user.findMany({
    where: { organizationId: session.user.organizationId, role: "EMPLOYEE", active: true, workMode: "FIELD" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true },
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Workforce"
        title="Field workers"
        subtitle={`${fieldEmployees.length} ${fieldEmployees.length === 1 ? "employee" : "employees"} working anywhere`}
        actions={<FieldExportDialog employees={fieldEmployees} />}
      />

      <FieldWorkersPanel employees={fieldEmployees} />
    </Page>
  );
}
