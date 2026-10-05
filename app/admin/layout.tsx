import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import AdminShell from "@/components/AdminShell";
import { FaceVerifyStatusBanner } from "@/components/FaceVerifyStatusBanner";
import { checkFaceVerifyHealth } from "@/lib/faceVerify";
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
  const [faceVerifyStatus, unavailableCheckInsToday] =
    isAdmin && organizationId
      ? await Promise.all([
          checkFaceVerifyHealth(),
          prisma.attendance.count({
            where: {
              faceVerifyStatus: "UNAVAILABLE",
              timestamp: { gte: startOfISTDay() },
              user: { organizationId },
            },
          }),
        ])
      : (["ok", 0] as const);

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
            <FaceVerifyStatusBanner status={faceVerifyStatus} unavailableCheckInsToday={unavailableCheckInsToday} />
          ) : null
        }
      >
        {children}
      </AdminShell>
    </Providers>
  );
}
