"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { BTN_PRIMARY, CARD, IconChip } from "./admin/ui";

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
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start gap-3">
        <IconChip icon={CalendarDays} />
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Annual leave quotas</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Days per year per leave type, same for every employee.
          </p>

          <div className="flex flex-wrap items-end gap-3 mt-4">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-slate-600">{label}</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={values[key]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [key]: e.target.value }));
                    setSaved(false);
                  }}
                  className="w-20 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
                />
              </div>
            ))}
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
        <div className="rounded-xl bg-red-50 text-red-600 p-2.5 text-xs border border-red-100">{error}</div>
      )}
      {saved && !error && (
        <div className="rounded-xl bg-emerald-50 text-emerald-700 p-2.5 text-xs border border-emerald-100">
          Setting saved.
        </div>
      )}
    </div>
  );
}
