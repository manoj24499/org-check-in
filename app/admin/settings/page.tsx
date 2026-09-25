import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import AppSettingsForm from "@/components/AppSettingsForm";
import ReimbursementRateForm from "@/components/ReimbursementRateForm";
import LeaveQuotaForm from "@/components/LeaveQuotaForm";
import LatenessThresholdForm from "@/components/LatenessThresholdForm";
import AdminsPanel from "@/components/AdminsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const [settings, admins] = await Promise.all([
    getSettings(session.user.organizationId),
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, isOwner: true, active: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div>
        <h1 className="text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted mt-1">
          App-wide configuration for the kiosk and mobile check-in flows.
        </p>
      </div>

      {/* Grid instead of one long stack — each card sizes to its column
          rather than assuming it owns the full row (see each form's own
          `h-full flex flex-col` for how they stay equal-height and put
          their error/saved banner at the bottom regardless of how much
          description text is above it). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AppSettingsForm checkOutPhotoRequired={settings.checkOutPhotoRequired} />
        <ReimbursementRateForm
          reimbursementRatePerKm={settings.reimbursementRatePerKm}
        />
        <LeaveQuotaForm
          quotas={{
            casualLeaveQuota: settings.casualLeaveQuota,
            sickLeaveQuota: settings.sickLeaveQuota,
            earnedLeaveQuota: settings.earnedLeaveQuota,
          }}
        />
        <LatenessThresholdForm lateThresholdMinutes={settings.lateThresholdMinutes} />
        <AdminsPanel admins={admins} />
      </div>
    </div>
  );
}
