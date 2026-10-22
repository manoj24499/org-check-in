import { notFound } from "next/navigation";
import { CheckCircle2, Hourglass, UserRoundCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PermissionsWorkspace, { type PermissionEntry } from "@/components/PermissionsWorkspace";
import { Page, PageHeader, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// Newest-first cap so the page stays fast for an org with years of history;
// well beyond what an admin scrolls through, and the search/filter operate on
// this window.
const HISTORY_LIMIT = 500;

/** Who is on timed permission right now (approved and inside their window),
 * and the full history of requests — the audit view the dashboard's
 * pending-only panel doesn't give. */
export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  const rows = await prisma.timedPermission.findMany({
    where: { attendance: { user: { organizationId } } },
    orderBy: { startTime: "desc" },
    take: HISTORY_LIMIT,
    include: {
      attendance: {
        select: { timestamp: true, user: { select: { id: true, employeeCode: true, name: true } } },
      },
    },
  });

  const entries: PermissionEntry[] = rows.map((p) => ({
    id: p.id,
    startTime: p.startTime.toISOString(),
    endTime: p.endTime.toISOString(),
    createdAt: p.createdAt.toISOString(),
    approvalStatus: p.approvalStatus,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewedByName: p.reviewedByName,
    attendanceDate: p.attendance.timestamp.toISOString(),
    employee: p.attendance.user,
  }));

  const nowMs = Date.now();
  const onNow = entries.filter(
    (p) =>
      p.approvalStatus === "APPROVED" &&
      new Date(p.startTime).getTime() <= nowMs &&
      nowMs < new Date(p.endTime).getTime(),
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const pendingCount = entries.filter((p) => p.approvalStatus === "PENDING").length;
  const todayCount = entries.filter((p) => new Date(p.startTime) >= startOfToday).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Permissions"
        subtitle="Who is on permission right now, and everyone who has been before."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="On permission now" value={onNow.length} hint="Approved, in their window" icon={UserRoundCheck} tone="green" />
        <StatCard label="Awaiting review" value={pendingCount} hint="Needs a decision" icon={Hourglass} tone="amber" />
        <StatCard label="Today" value={todayCount} hint="Permissions starting today" icon={CheckCircle2} tone="orange" />
      </div>

      <PermissionsWorkspace onNow={onNow} history={entries} />
    </Page>
  );
}
