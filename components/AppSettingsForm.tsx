"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

export default function AppSettingsForm({
  checkOutPhotoRequired: initialValue,
}: {
  checkOutPhotoRequired: boolean;
}) {
  const router = useRouter();
  const [checkOutPhotoRequired, setCheckOutPhotoRequired] =
    useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleToggle(next: boolean) {
    setCheckOutPhotoRequired(next);
    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkOutPhotoRequired: next }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setCheckOutPhotoRequired(!next);
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6 max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Require photo on check-out
            </p>
            <p className="text-xs text-secondary mt-1">
              When enabled, employees must take a presence photo to check out,
              the same as check-in — on both the kiosk and the mobile app.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checkOutPhotoRequired}
          disabled={loading}
          onClick={() => handleToggle(!checkOutPhotoRequired)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            checkOutPhotoRequired ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              checkOutPhotoRequired ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-4 rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
