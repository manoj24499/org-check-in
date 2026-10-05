import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OvertimeHistoryList from "@/components/OvertimeHistoryList";
import OvertimeStatusPanel from "@/components/OvertimeStatusPanel";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Two panels side by side, same sizing convention as the Leave page's
 * LeaveRequestsPanel/HolidayManager split: left is who's currently working
 * overtime right now, org-wide (see OvertimeStatusPanel — a request lives
 * here until checked out); right is every completed request, with its work
 * summary/photo and approve/decline history (see OvertimeHistoryList). A
 * request moves from left to right the instant it's closed out at a
 * checkout — never shown in both at once. */
export default async function OvertimePage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  const [activeRaw, completedRaw] = await Promise.all([
    prisma.overtimeRequest.findMany({
      where: { submittedAt: null, attendance: { user: { organizationId } } },
      orderBy: { createdAt: "asc" },
      include: { attendance: { select: { user: { select: { id: true, employeeCode: true, name: true } } } } },
    }),
    prisma.overtimeRequest.findMany({
      where: { submittedAt: { not: null }, attendance: { user: { organizationId } } },
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
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Overtime"
        subtitle="Who is working overtime right now on the left; completed requests with work summaries and photos on the right."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">
        <OvertimeStatusPanel initialRequests={active} />
        <OvertimeHistoryList requests={completed} />
      </div>
    </Page>
  );
}
