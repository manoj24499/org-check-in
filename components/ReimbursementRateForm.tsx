"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee } from "lucide-react";

export default function ReimbursementRateForm({
  reimbursementRatePerKm: initialValue,
}: {
  reimbursementRatePerKm: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(
    initialValue !== null ? String(initialValue) : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setError("Enter a rate of 0 or more.");
      return;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reimbursementRatePerKm: parsed }),
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
    <div className="rounded-xl bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <IndianRupee className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Field reimbursement rate
          </p>
          <p className="text-xs text-secondary mt-1">
            Default ₹/km suggestion on the Field workers panel — editable per employee, per day, before saving.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-sm font-medium text-muted">₹</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 8"
              className="w-20 rounded-xl border border-black/10 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 focus:bg-white transition-all"
            />
            <span className="text-sm text-secondary">/ km</span>
            <button
              onClick={handleSave}
              disabled={loading}
              className="ml-auto rounded-xl border border-transparent bg-orange-600 shadow-sm px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 transition disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mt-3 rounded-xl bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
