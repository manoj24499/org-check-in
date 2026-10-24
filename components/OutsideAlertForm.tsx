"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { BTN_PRIMARY, CARD, IconChip } from "./admin/ui";

export default function OutsideAlertForm({ outsideAlertMinutes: initialValue }: { outsideAlertMinutes: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialValue));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 480) {
      setError("Enter a whole number of minutes between 0 and 480 (0 turns the alert off).");
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outsideAlertMinutes: parsed }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start gap-3">
        <IconChip icon={MapPin} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Outside-area alert</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Alert admins when an Office or work-from-home employee has been outside their working area for this many
            minutes. It shows on Notifications and in the sidebar badge. Set 0 to turn it off.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              max={480}
              step="1"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 30"
              className="w-24 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            />
            <span className="text-sm text-slate-500">minutes</span>
            <button onClick={handleSave} disabled={loading} className={`${BTN_PRIMARY} ml-auto`}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-100 bg-red-50 p-2.5 text-xs text-red-600">{error}</div>}
      {saved && !error && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 text-xs text-emerald-700">Setting saved.</div>
      )}
    </div>
  );
}
