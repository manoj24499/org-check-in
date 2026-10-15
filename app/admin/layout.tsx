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
  const orgName =
    isAdmin && organizationId
      ? (await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }))?.name
      : null;
  const pending =
    isAdmin && organizationId ? await getPendingCounts(organizationId) : { leave: 0, overtime: 0, support: 0 };
  const pendingLeaveCount = pending.leave;
  const pendingOvertimeCount = pending.overtime;
  const pendingSupportCount = pending.support;
  // The banner follows the service's *current* state: it shows while the service is
  // down, and for a short while after check-ins slipped through without a face check,
  // then clears by itself once the service has been healthy again for a while.
  const [faceVerifyStatus, unavailableToday] =
    isAdmin && organizationId
      ? await Promise.all([
          checkFaceVerifyHealth(),
          prisma.attendance.aggregate({
            _count: true,
            _max: { timestamp: true },
            where: {
              faceVerifyStatus: "UNAVAILABLE",
              timestamp: { gte: startOfISTDay() },
              user: { organizationId },
            },
          }),
        ])
      : (["ok", { _count: 0, _max: { timestamp: null } }] as const);
  const unavailableCheckInsToday = unavailableToday._count;
  // Notifications waiting for the admin (the badge on the sidebar item), and whether the admin already
  // deleted today's face-service alert (then the top banner stays hidden too).
  const [notifications, dismissedKeys] =
    isAdmin && organizationId
      ? await Promise.all([getAdminNotifications(organizationId, { faceStatus: faceVerifyStatus }), getDismissedKeys(organizationId)])
      : [[], new Set<string>()];
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
          isAdmin && !faceBannerDismissed ? (
            <FaceVerifyStatusBanner
              status={faceVerifyStatus}
              unavailableCheckInsToday={unavailableCheckInsToday}
              recentlyMissed={happenedWithin(lastUnavailableAt, 30 * 60 * 1000)}
            />
          ) : null
        }
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
