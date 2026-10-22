"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, WifiOff, type LucideIcon } from "lucide-react";
import { CARD, IconChip } from "./admin/ui";

type SettingKey = "checkOutPhotoRequired" | "offlineCheckInEnabled";

function Toggle({
  icon,
  title,
  text,
  checked,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <IconChip icon={icon} />
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{text}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
          checked ? "bg-orange-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function AppSettingsForm({
  checkOutPhotoRequired: initialPhoto,
  offlineCheckInEnabled: initialOffline,
}: {
  checkOutPhotoRequired: boolean;
  offlineCheckInEnabled: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<SettingKey, boolean>>({
    checkOutPhotoRequired: initialPhoto,
    offlineCheckInEnabled: initialOffline,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleToggle(key: SettingKey, next: boolean) {
    setValues((v) => ({ ...v, [key]: next }));
    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setValues((v) => ({ ...v, [key]: !next }));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className={`${CARD} flex h-full flex-col gap-5 p-5`}>
      <Toggle
        icon={Camera}
        title="Require photo on check-out"
        text="Employees must take a presence photo to check out, same as check-in — kiosk and mobile."
        checked={values.checkOutPhotoRequired}
        disabled={loading}
        onChange={(next) => handleToggle("checkOutPhotoRequired", next)}
      />
      <div className="border-t border-slate-100" />
      <Toggle
        icon={WifiOff}
        title="Allow offline check-in (mobile app)"
        text="With no signal, the app saves the check-in or check-out and sends it when the phone is back online. Records older than 6 hours are refused. The shared kiosk always needs a connection."
        checked={values.offlineCheckInEnabled}
        disabled={loading}
        onChange={(next) => handleToggle("offlineCheckInEnabled", next)}
      />

      {error && (
        <div className="rounded-xl bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
