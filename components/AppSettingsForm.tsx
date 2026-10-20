"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { CARD, IconChip } from "./admin/ui";

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
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconChip icon={Camera} />
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">
              Require photo on check-out
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
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
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
 checkOutPhotoRequired ? "bg-orange-600" : "bg-slate-300"
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
