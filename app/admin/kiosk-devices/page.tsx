import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import KioskDevicesPanel from "@/components/KioskDevicesPanel";
import { Page, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

// Kept out of the component body: the page is re-rendered per request, so reading the clock here is fine.
const isInFuture = (d: Date | null) => d !== null && d.getTime() > Date.now();

export default async function KioskDevicesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.organizationId) notFound();

  const [devices, org] = await Promise.all([
    prisma.kioskDevice.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, tokenHash: true, pairedAt: true, lastUsedAt: true, pairingExpiresAt: true },
    }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { slug: true } }),
  ]);

  return (
    <Page>
      <PageHeader
        eyebrow="Workspace"
        title="Kiosk devices"
        subtitle="Pair a fixed kiosk PC or tablet so it checks people in without depending on the browser's location."
      />
      <KioskDevicesPanel
        kioskPath={org?.slug ? `/kiosk/${org.slug}` : "/kiosk"}
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          paired: d.tokenHash !== null,
          pairedAt: d.pairedAt?.toISOString() ?? null,
          lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
          pairingExpiresAt: d.pairingExpiresAt?.toISOString() ?? null,
          codeActive: d.tokenHash === null && isInFuture(d.pairingExpiresAt),
        }))}
      />
    </Page>
  );
}
