import { getSettings } from "@/lib/settings";
import AppSettingsForm from "@/components/AppSettingsForm";
import ReimbursementRateForm from "@/components/ReimbursementRateForm";
import LeaveQuotaForm from "@/components/LeaveQuotaForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

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
    </div>
  );
}
