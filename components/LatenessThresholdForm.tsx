"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

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
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Lateness cutoff
          </p>
          <p className="text-xs text-secondary mt-1">
            A check-in this many minutes past shift start is marked Permission; beyond it, Half-day leave. Applies at
            check-in and when an admin edits a check-in time — existing records are unaffected.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
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
              className="w-20 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            />
            <span className="text-sm text-secondary">minutes</span>
            <button
              onClick={handleSave}
              disabled={loading}
              className="ml-auto rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mt-3 rounded-lg bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
