import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import AdminShell from "@/components/AdminShell";
import { getAdminNotifications } from "@/lib/adminNotifications";
import { getPendingCounts } from "@/lib/adminCounts";
import { trialState } from "@/lib/trial";
import TrialBanner from "@/components/TrialBanner";

/**
 * The shell's side data (organization name, badge counts, notifications) is nice to have on every admin page, but
 * not worth losing the page over. If one of these queries fails (a busy database connection pool, a slow face-service
 * check), the page still opens with that part empty instead of showing "Something went wrong"; the failure is logged.
 */
async function safe<T>(label: string, work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (err) {
    console.error(`[admin layout] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN" && Boolean(session.user.organizationId);
  const organizationId = session?.user?.organizationId;
  // Server-rendered once per navigation (no live polling) — same "refresh to
  // see new state" pattern the rest of the admin panel already uses.
  //
  // Everything below is independent, so it all runs at once instead of one round trip after another
  // (this layout wraps every admin page, so each extra step slowed every navigation).
  const ready = isAdmin && organizationId ? organizationId : null;
  const [orgRow, pending, notifications] = await Promise.all([
    ready
      ? safe("organization", prisma.organization.findUnique({ where: { id: ready }, select: { name: true, isTrial: true, trialEndsAt: true, planTier: true } }), null)
      : null,
    ready ? safe("pending counts", getPendingCounts(ready), { leave: 0, overtime: 0, support: 0 }) : { leave: 0, overtime: 0, support: 0 },
    // Notifications waiting for the admin (the badge on the sidebar item). Alerts are shown on the
    // Notifications page only, not on the dashboard or as a banner.
    ready ? safe("notifications", getAdminNotifications(ready), []) : [],
  ]);
  const orgName = orgRow?.name ?? null;
  const trial = orgRow ? trialState(orgRow) : null;
  const pendingLeaveCount = pending.leave;
  const pendingOvertimeCount = pending.overtime;
  const pendingSupportCount = pending.support;
  return (
    <Providers>
      <TabSecurity />
      {/* Full-height app shell: a left sidebar plus a content column where
          only `main` scrolls, so navigation stays put however long a page
          gets (see components/AdminShell.tsx). */}
      <AdminShell
        userName={session?.user?.name}
        orgName={orgName}
        pendingLeaveCount={pendingLeaveCount}
        pendingOvertimeCount={pendingOvertimeCount}
        pendingSupportCount={pendingSupportCount}
        notificationCount={notifications.length}
        banner={
          <>
            {isAdmin && trial?.onTrial && trial.endsAt && trial.daysLeft !== null ? (
              <TrialBanner daysLeft={trial.daysLeft} endsAt={trial.endsAt} />
            ) : null}
          </>
        }
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
