import { prisma } from "@/lib/prisma";
import OfficeLocationForm from "@/components/OfficeLocationForm";
import WfhLocationTable from "@/components/WfhLocationTable";
import FieldLocationTable from "@/components/FieldLocationTable";

export const dynamic = "force-dynamic";

export default async function OfficeLocationPage() {
  const [officeLocation, wfhEmployees, fieldEmployees, allEmployees] =
    await Promise.all([
      prisma.officeLocation.findFirst({
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
      }),
      prisma.user.findMany({
        where: { role: "EMPLOYEE", workMode: "WFH" },
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
        where: { role: "EMPLOYEE", workMode: "FIELD" },
        orderBy: { name: "asc" },
        select: { id: true, employeeCode: true, name: true, active: true },
      }),
      // Shared candidate list for both tables' "Add" pickers.
      prisma.user.findMany({
        where: { role: "EMPLOYEE" },
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
    <div className="flex flex-col gap-8 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            Office location
          </h1>
          <p className="text-sm text-muted mt-1">
            Employees must check in within the allowed radius of this location.
          </p>
        </div>

        <OfficeLocationForm officeLocation={officeLocation} />
      </div>

      <WfhLocationTable employees={wfhEmployees} allEmployees={allEmployees} />

      <FieldLocationTable
        employees={fieldEmployees}
        allEmployees={allEmployees}
      />
    </div>
  );
}
