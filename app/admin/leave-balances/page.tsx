import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { istDateKey } from "@/lib/istTime";
import { Page, PageHeader } from "@/components/admin/ui";
import LeaveBalancesTable, { type BalanceRow } from "@/components/LeaveBalancesTable";

export const dynamic = "force-dynamic";

const TYPES = ["CASUAL", "SICK", "EARNED"] as const;

export default async function LeaveBalancesPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  // Same rules as getLeaveBalances (lib/timeOff.ts): this IST calendar year, approved days only,
  // but for the whole team in one query instead of one per employee.
  const year = Number(istDateKey().slice(0, 4));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [settings, employees, requests] = await Promise.all([
    getSettings(organizationId),
    prisma.user.findMany({
      where: { organizationId, role: "EMPLOYEE", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeCode: true },
    }),
    prisma.timeOffRequest.findMany({
      where: { user: { organizationId }, status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: yearStart, lt: yearEnd } },
      select: { userId: true, type: true, days: true, status: true },
    }),
  ]);

  const quota = {
    CASUAL: settings.casualLeaveQuota,
    SICK: settings.sickLeaveQuota,
    EARNED: settings.earnedLeaveQuota,
  };

  const rows: BalanceRow[] = employees.map((e) => {
    const mine = requests.filter((r) => r.userId === e.id);
    return {
      id: e.id,
      name: e.name,
      code: e.employeeCode,
      pending: mine.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.days, 0),
      pendingRequests: mine.filter((r) => r.status === "PENDING").length,
      balances: TYPES.map((type) => {
        const used = mine.filter((r) => r.status === "APPROVED" && r.type === type).reduce((s, r) => s + r.days, 0);
        return { type, quota: quota[type], used, remaining: Math.max(0, quota[type] - used) };
      }),
    };
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Workforce"
        title="Leave balances"
        subtitle={`${rows.length} ${rows.length === 1 ? "employee" : "employees"} · ${year} calendar year · approved leave only`}
      />
      <LeaveBalancesTable rows={rows} />
    </Page>
  );
}
