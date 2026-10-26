import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import AdminShell from "@/components/AdminShell";
import { FaceVerifyStatusBanner } from "@/components/FaceVerifyStatusBanner";
import { checkFaceVerifyHealth, happenedWithin } from "@/lib/faceVerify";
import { startOfISTDay } from "@/lib/istTime";
import { faceServiceKey, getAdminNotifications, getDismissedKeys } from "@/lib/adminNotifications";
import { getPendingCounts } from "@/lib/adminCounts";
import { trialState } from "@/lib/trial";
import TrialBanner from "@/components/TrialBanner";

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
  // The banner follows the face service's *current* state: it shows while the service is
  // down, and for a short while after check-ins slipped through without a face check,
  // then clears by itself once the service has been healthy again for a while.
  const ready = isAdmin && organizationId ? organizationId : null;
  const [orgRow, pending, faceVerifyStatus, unavailableToday, notifications, dismissedKeys] = await Promise.all([
    ready ? prisma.organization.findUnique({ where: { id: ready }, select: { name: true, isTrial: true, trialEndsAt: true, planTier: true } }) : null,
    ready ? getPendingCounts(ready) : { leave: 0, overtime: 0, support: 0 },
    ready ? checkFaceVerifyHealth() : ("ok" as const),
    ready
      ? prisma.attendance.aggregate({
          _count: true,
          _max: { timestamp: true },
          where: {
            faceVerifyStatus: "UNAVAILABLE",
            timestamp: { gte: startOfISTDay() },
            user: { organizationId: ready },
          },
        })
      : { _count: 0, _max: { timestamp: null as Date | null } },
    // Notifications waiting for the admin (the badge on the sidebar item). It asks for the face
    // service's state itself; that check is cached and shared, so it costs nothing extra here.
    ready ? getAdminNotifications(ready) : [],
    // Whether the admin already deleted today's face-service alert (then the top banner stays hidden too).
    ready ? getDismissedKeys(ready) : new Set<string>(),
  ]);
  const orgName = orgRow?.name ?? null;
  const trial = orgRow ? trialState(orgRow) : null;
  const pendingLeaveCount = pending.leave;
  const pendingOvertimeCount = pending.overtime;
  const pendingSupportCount = pending.support;
  const unavailableCheckInsToday = unavailableToday._count;
  const faceBannerDismissed = dismissedKeys.has(faceServiceKey());
  const lastUnavailableAt = unavailableToday._max.timestamp?.toISOString() ?? null;

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
            {isAdmin && !faceBannerDismissed ? (
              <FaceVerifyStatusBanner
                status={faceVerifyStatus}
                unavailableCheckInsToday={unavailableCheckInsToday}
                recentlyMissed={happenedWithin(lastUnavailableAt, 30 * 60 * 1000)}
              />
            ) : null}
          </>
        }
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
