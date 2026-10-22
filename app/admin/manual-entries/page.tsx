import { notFound } from "next/navigation";
import { CheckCircle2, Hourglass, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ManualEntriesWorkspace, { type ManualEntryRow } from "@/components/ManualEntriesWorkspace";
import { Page, PageHeader, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 300;

/** Employees' requests for an admin to record a day the device missed — pending queue plus decided history. */
export default async function ManualEntriesPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  const rows = await prisma.manualEntryRequest.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: { user: { select: { id: true, employeeCode: true, name: true } } },
  });

  const requests: ManualEntryRow[] = rows.map((r) => ({
    id: r.id,
    date: r.date,
    checkInAt: r.checkInAt.toISOString(),
    checkOutAt: r.checkOutAt.toISOString(),
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByName: r.reviewedByName,
    reviewNote: r.reviewNote,
    employee: r.user,
  }));

  const count = (s: ManualEntryRow["status"]) => requests.filter((r) => r.status === s).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Manual entries"
        subtitle="Days an employee worked but the device missed. Approve to add their check-in and check-out. You can also add one directly from an employee's page."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting review" value={count("PENDING")} hint="Needs a decision" icon={Hourglass} tone="amber" />
        <StatCard label="Approved" value={count("APPROVED")} hint="Added to attendance" icon={CheckCircle2} tone="green" />
        <StatCard label="Declined" value={count("REJECTED")} hint="Not added" icon={XCircle} tone="red" />
      </div>
      <ManualEntriesWorkspace requests={requests} />
    </Page>
  );
}
