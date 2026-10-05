import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SupportTicketList from "@/components/SupportTicketList";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Employee-submitted "something's wrong" reports from the mobile app's
 * Profile > Help screen — see the schema comment on SupportTicket. One
 * list, newest first, with an open/resolved filter (SupportTicketList) —
 * unlike Leave/Overtime this has no "currently in progress, live" concept
 * worth a separate panel, so a single list is enough. */
export default async function SupportPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();

  const tickets = await prisma.supportTicket.findMany({
    where: { user: { organizationId: session.user.organizationId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      message: true,
      hasPhoto: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      adminNote: true,
      user: { select: { employeeCode: true, name: true } },
    },
  });

  const serialized = tickets.map((t) => ({
    ...t,
    status: t.status as "OPEN" | "RESOLVED",
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
  }));

  return (
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Support"
        subtitle="Issues employees reported from the app: wrong hours, geofence trouble, or anything else."
      />

      <SupportTicketList tickets={serialized} />
    </Page>
  );
}
