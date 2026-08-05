import { getSettings } from "@/lib/settings";
import AppSettingsForm from "@/components/AppSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Settings</h1>
        <p className="text-secondary mt-1 font-medium">
          App-wide configuration for the kiosk and mobile check-in flows.
        </p>
      </div>

      <AppSettingsForm checkOutPhotoRequired={settings.checkOutPhotoRequired} />
    </div>
  );
}
