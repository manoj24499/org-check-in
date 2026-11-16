import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LocationHistoryPanel from "@/components/LocationHistoryPanel";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Where Hybrid and Work-from-home employees were, day by day. Field workers have their own page (Field workers)
 * with stops, odometer and reimbursement; these employees mostly stay put, so this is just the route, when
 * they were checked in, the office / home / transit timeline and any stretch the phone stopped reporting.
 */
export default async function LocationHistoryPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  const employees = await prisma.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      role: "EMPLOYEE",
      active: true,
      workMode: { in: ["HYBRID", "WFH"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employeeCode: true, workMode: true },
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Workforce"
        title="Location history"
        subtitle={`${employees.length} Hybrid and Work-from-home ${employees.length === 1 ? "employee" : "employees"} · pick a day to see the route`}
      />
      <LocationHistoryPanel employees={employees} />
    </Page>
  );
}
