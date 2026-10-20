"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { BTN_PRIMARY, CARD, IconChip } from "./admin/ui";

export default function LatenessThresholdForm({
  lateThresholdMinutes: initialValue,
}: {
  lateThresholdMinutes: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initialValue));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 480) {
      setError("Enter a whole number of minutes between 1 and 480.");
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lateThresholdMinutes: parsed }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
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
        <IconChip icon={Clock} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">
            Lateness cutoff
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            A check-in this many minutes past shift start is marked Permission; beyond it, Half-day leave. Applies at
            check-in and when an admin edits a check-in time — existing records are unaffected.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <input
              type="number"
              min={1}
              max={480}
              step="1"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 60"
              className="w-24 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            />
            <span className="text-sm text-slate-500">minutes</span>
            <button
              onClick={handleSave}
              disabled={loading}
              className={`${BTN_PRIMARY} ml-auto`}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="rounded-xl bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
