import Link from "next/link";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import LeaveRequestsPanel from "@/components/LeaveRequestsPanel";
import HolidayManager from "@/components/HolidayManager";

export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const year = new Date().getFullYear();

  const [pendingRaw, holidaysRaw] = await Promise.all([
    prisma.timeOffRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, employeeCode: true, name: true } } },
    }),
    prisma.publicHoliday.findMany({
      where: { date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
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
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">Leave</h1>
          <p className="text-sm text-muted mt-1">Review leave requests and manage the public holiday calendar.</p>
        </div>
        <Link
          href="/api/admin/leave-requests/export"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition-colors self-start"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Link>
      </div>

      {/* Side by side, each capped to roughly the viewport height so neither
          section's list can push the page into a long scroll — see
          LeaveRequestsPanel/HolidayManager's own internal overflow-y-auto
          for what happens once a list is taller than that. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-220px)] lg:min-h-[420px]">
        <LeaveRequestsPanel initialRequests={pending} />
        <HolidayManager holidays={holidays} />
      </div>
    </div>
  );
}
