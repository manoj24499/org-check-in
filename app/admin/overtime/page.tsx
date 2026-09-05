import { prisma } from "@/lib/prisma";
import OvertimeHistoryList from "@/components/OvertimeHistoryList";

export const dynamic = "force-dynamic";

/** Every overtime request org-wide, newest first — active and completed
 * alike, so a completed request's work summary/photo (only ever visible
 * here, not on the dashboard's "currently working" panel, which drops a
 * request the moment it's closed out at checkout) is reviewable in one
 * place, across every employee. */
export default async function OvertimePage() {
  const requestsRaw = await prisma.overtimeRequest.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      estimatedEndAt: true,
      reason: true,
      status: true,
      workSummary: true,
      hasPhoto: true,
      submittedAt: true,
      createdAt: true,
      attendance: { select: { user: { select: { employeeCode: true, name: true } } } },
    },
  });

  const requests = requestsRaw.map((r) => ({
    id: r.id,
    estimatedEndAt: r.estimatedEndAt.toISOString(),
    reason: r.reason,
    status: r.status,
    workSummary: r.workSummary,
    hasPhoto: r.hasPhoto,
    active: r.submittedAt === null,
    createdAt: r.createdAt.toISOString(),
    employee: r.attendance.user,
  }));

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div>
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">Overtime</h1>
        <p className="text-sm text-muted mt-1">
          Every overtime request, across every employee — review work summaries and photos, and approve or
          decline for your own records.
        </p>
      </div>

      {requests.length > 0 ? (
        <OvertimeHistoryList requests={requests} />
      ) : (
        <p className="text-sm text-muted">No overtime requests yet.</p>
      )}
    </div>
  );
}
