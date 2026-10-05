import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OfficeLocationForm from "@/components/OfficeLocationForm";
import WfhLocationTable from "@/components/WfhLocationTable";
import FieldLocationTable from "@/components/FieldLocationTable";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function OfficeLocationPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  const [officeLocation, wfhEmployees, fieldEmployees, allEmployees] =
    await Promise.all([
      prisma.officeLocation.findUnique({
        where: { organizationId },
        select: {
          name: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
      }),
      prisma.user.findMany({
        where: { organizationId, role: "EMPLOYEE", workMode: "WFH" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          active: true,
          homeLatitude: true,
          homeLongitude: true,
          homeRadiusMeters: true,
        },
      }),
      prisma.user.findMany({
        where: { organizationId, role: "EMPLOYEE", workMode: "FIELD" },
        orderBy: { name: "asc" },
        select: { id: true, employeeCode: true, name: true, active: true },
      }),
      // Shared candidate list for both tables' "Add" pickers.
      prisma.user.findMany({
        where: { organizationId, role: "EMPLOYEE" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          employeeCode: true,
          name: true,
          active: true,
          workMode: true,
        },
      }),
    ]);

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Workspace"
          title="Office location"
          subtitle="Employees must check in within the allowed radius of this location."
        />

        <OfficeLocationForm officeLocation={officeLocation} />
      </div>

      <WfhLocationTable employees={wfhEmployees} allEmployees={allEmployees} />

      <FieldLocationTable
        employees={fieldEmployees}
        allEmployees={allEmployees}
      />
    </Page>
  );
}
