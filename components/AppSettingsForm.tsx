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
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Camera className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Require photo on check-out
            </p>
            <p className="text-xs text-secondary mt-1">
              Employees must take a presence photo to check out, same as check-in — kiosk and mobile.
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
        <div className="mt-3 rounded-lg bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-3 rounded-lg bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
