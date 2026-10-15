import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/admin/ui";
import NotificationsList from "@/components/NotificationsList";
import { auth } from "@/lib/auth";
import { getAdminNotifications, pruneOldDismissals } from "@/lib/adminNotifications";

export const dynamic = "force-dynamic";

/** Every alert the dashboard shows, in one place, each with a delete button. */
export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  await pruneOldDismissals(organizationId);
  const notifications = await getAdminNotifications(organizationId);

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="Notifications"
        subtitle="Alerts from your team: tracking that stopped, check-ins that skipped the face check, and requests waiting for you. Deleting one hides it here and on the dashboard."
      />
      <NotificationsList initial={notifications} />
    </Page>
  );
}
