import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import AdminShell from "@/components/AdminShell";
import { FaceVerifyStatusBanner } from "@/components/FaceVerifyStatusBanner";
import { checkFaceVerifyHealth, happenedWithin } from "@/lib/faceVerify";
import { startOfISTDay } from "@/lib/istTime";

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
  const pendingLeaveCount =
    isAdmin && organizationId
      ? await prisma.timeOffRequest.count({ where: { status: "PENDING", user: { organizationId } } })
      : 0;
  const pendingOvertimeCount =
    isAdmin && organizationId
      ? await prisma.overtimeRequest.count({
          where: { status: "PENDING", attendance: { user: { organizationId } } },
        })
      : 0;
  const pendingSupportCount =
    isAdmin && organizationId
      ? await prisma.supportTicket.count({ where: { status: "OPEN", user: { organizationId } } })
      : 0;
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
        banner={
          isAdmin ? (
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
