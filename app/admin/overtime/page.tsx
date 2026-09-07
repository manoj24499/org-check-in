import { prisma } from "@/lib/prisma";
import OvertimeHistoryList from "@/components/OvertimeHistoryList";
import OvertimeStatusPanel from "@/components/OvertimeStatusPanel";

export const dynamic = "force-dynamic";

/** Two panels side by side, same sizing convention as the Leave page's
 * LeaveRequestsPanel/HolidayManager split: left is who's currently working
 * overtime right now, org-wide (see OvertimeStatusPanel — a request lives
 * here until checked out); right is every completed request, with its work
 * summary/photo and approve/decline history (see OvertimeHistoryList). A
 * request moves from left to right the instant it's closed out at a
 * checkout — never shown in both at once. */
export default async function OvertimePage() {
  const [activeRaw, completedRaw] = await Promise.all([
    prisma.overtimeRequest.findMany({
      where: { submittedAt: null },
      orderBy: { createdAt: "asc" },
      include: { attendance: { select: { user: { select: { id: true, employeeCode: true, name: true } } } } },
    }),
    prisma.overtimeRequest.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        estimatedEndAt: true,
        reason: true,
        status: true,
        workSummary: true,
        hasPhoto: true,
        createdAt: true,
        attendance: { select: { user: { select: { employeeCode: true, name: true } } } },
      },
    }),
  ]);

  const active = activeRaw.map((r) => ({
    id: r.id,
    estimatedEndAt: r.estimatedEndAt.toISOString(),
    reason: r.reason,
    status: r.status,
    employee: r.attendance.user,
  }));

  const completed = completedRaw.map((r) => ({
    id: r.id,
    estimatedEndAt: r.estimatedEndAt.toISOString(),
    reason: r.reason,
    status: r.status,
    workSummary: r.workSummary,
    hasPhoto: r.hasPhoto,
    createdAt: r.createdAt.toISOString(),
    employee: r.attendance.user,
  }));

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div>
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">Overtime</h1>
        <p className="text-sm text-muted mt-1">
          Who&apos;s working overtime right now on the left; completed requests with work summaries and photos,
          across every employee, on the right.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-220px)] lg:min-h-[420px]">
        <OvertimeStatusPanel initialRequests={active} />
        <OvertimeHistoryList requests={completed} />
      </div>
    </div>
  );
}
