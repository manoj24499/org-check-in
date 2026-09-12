import { prisma } from "@/lib/prisma";
import SupportTicketList from "@/components/SupportTicketList";

export const dynamic = "force-dynamic";

/** Employee-submitted "something's wrong" reports from the mobile app's
 * Profile > Help screen — see the schema comment on SupportTicket. One
 * list, newest first, with an open/resolved filter (SupportTicketList) —
 * unlike Leave/Overtime this has no "currently in progress, live" concept
 * worth a separate panel, so a single list is enough. */
export default async function SupportPage() {
  const tickets = await prisma.supportTicket.findMany({
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
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div>
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">Support</h1>
        <p className="text-sm text-muted mt-1">
          Issues employees reported from the app — wrong hours, geofence trouble, or anything else.
        </p>
      </div>

      <SupportTicketList tickets={serialized} />
    </div>
  );
}
