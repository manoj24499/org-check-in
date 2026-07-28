import { prisma } from "@/lib/prisma";
import OfficeLocationForm from "@/components/OfficeLocationForm";
import WfhLocationTable from "@/components/WfhLocationTable";

export const dynamic = "force-dynamic";

export default async function OfficeLocationPage() {
  const [officeLocation, wfhEmployees] = await Promise.all([
    prisma.officeLocation.findFirst({
      orderBy: { createdAt: "asc" },
      select: { name: true, latitude: true, longitude: true, radiusMeters: true },
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
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Office Location</h1>
          <p className="text-secondary mt-1 font-medium">
            Employees must check in within the allowed radius of this location.
          </p>
        </div>

        <OfficeLocationForm officeLocation={officeLocation} />
      </div>

      <WfhLocationTable employees={wfhEmployees} />
    </div>
  );
}
