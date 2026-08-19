"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";

interface LeaveQuotas {
  casualLeaveQuota: number;
  sickLeaveQuota: number;
  earnedLeaveQuota: number;
}

const FIELDS: { key: keyof LeaveQuotas; label: string }[] = [
  { key: "casualLeaveQuota", label: "Casual" },
  { key: "sickLeaveQuota", label: "Sick" },
  { key: "earnedLeaveQuota", label: "Earned" },
];

// Same global-quota-for-everyone precedent as reimbursementRatePerKm — one
// number per leave type, editable here, with no per-employee override yet.
export default function LeaveQuotaForm({ quotas: initial }: { quotas: LeaveQuotas }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof LeaveQuotas, string>>({
    casualLeaveQuota: String(initial.casualLeaveQuota),
    sickLeaveQuota: String(initial.sickLeaveQuota),
    earnedLeaveQuota: String(initial.earnedLeaveQuota),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const parsed: Partial<LeaveQuotas> = {};
    for (const { key, label } of FIELDS) {
      const n = Number(values[key]);
      if (!Number.isInteger(n) || n < 0) {
        setError(`Enter a whole number of ${label.toLowerCase()} days (0 or more).`);
        return;
      }
      parsed[key] = n;
    }

    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
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
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <CalendarDays className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Annual leave quotas</p>
          <p className="text-xs text-secondary mt-1">
            Days per year for each leave type, same for every employee. An employee&apos;s remaining balance is
            always this quota minus their approved days used so far this year.
          </p>

          <div className="flex flex-wrap items-end gap-4 mt-3">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-xs text-muted">{label}</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={values[key]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setSaved(false);
                  }}
                  className="w-20 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />
              </div>
            ))}
            <button
              onClick={handleSave}
              disabled={loading}
              className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">{error}</div>
      )}
      {saved && !error && (
        <div className="mt-4 rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
