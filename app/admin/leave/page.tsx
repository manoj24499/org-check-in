import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Download, Flag } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeaveRequestsPanel from "@/components/LeaveRequestsPanel";
import HolidayManager from "@/components/HolidayManager";
import { istDateKey } from "@/lib/istTime";
import { BTN_SECONDARY, Page, PageHeader, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  const year = Number(istDateKey().slice(0, 4));

  const [pendingRaw, holidaysRaw] = await Promise.all([
    prisma.timeOffRequest.findMany({
      where: { status: "PENDING", user: { organizationId } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, employeeCode: true, name: true } } },
    }),
    prisma.publicHoliday.findMany({
      where: { organizationId, date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      orderBy: { date: "asc" },
    }),
  ]);

  const pending = pendingRaw.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    days: r.days,
    reason: r.reason,
    employee: r.user,
  }));
  const holidays = holidaysRaw.map((h) => ({
    id: h.id,
    date: h.date.toISOString(),
    name: h.name,
  }));

  return (
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Leave"
        subtitle="Review leave requests and manage the public holiday calendar."
        actions={
          <Link href="/api/admin/leave-requests/export" className={BTN_SECONDARY}>
            <Download className="h-4 w-4" />
            Export CSV
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={pending.length} hint="Waiting for your decision" icon={Clock} tone="orange" />
        <StatCard
          label="Days requested"
          value={pending.reduce((sum, r) => sum + r.days, 0)}
          hint="Across all pending requests"
          icon={CalendarDays}
          tone="indigo"
        />
        <StatCard label={`Holidays in ${year}`} value={holidays.length} hint="On the public calendar" icon={Flag} tone="green" />
      </div>

      {/* Side by side, each capped to roughly the viewport height so neither
          section's list can push the page into a long scroll — see
          LeaveRequestsPanel/HolidayManager's own internal overflow-y-auto
          for what happens once a list is taller than that. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">
        <LeaveRequestsPanel initialRequests={pending} />
        <HolidayManager holidays={holidays} />
      </div>
    </Page>
  );
}
