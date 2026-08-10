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
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <IndianRupee className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Field reimbursement rate
          </p>
          <p className="text-xs text-secondary mt-1">
            The default ₹/km rate used to suggest a petrol/travel reimbursement
            amount on the Field workers panel, based on distance traveled that
            day. Admin can still edit the amount per employee, per day, before
            saving it.
          </p>

          <div className="flex items-center gap-2 mt-3">
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
              className="w-28 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            />
            <span className="text-sm text-secondary">/ km</span>
            <button
              onClick={handleSave}
              disabled={loading}
              className="ml-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mt-4 rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
