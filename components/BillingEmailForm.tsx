"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

/** Extra address that also gets trial reminder and billing emails (the owner admin always does). */
export default function BillingEmailForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = value.trim().toLowerCase() !== (initial ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/billing-email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingEmail: value }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? "Couldn't save." });
      return;
    }
    setMsg({ ok: true, text: data.billingEmail ? "Saved." : "Removed." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-1.5 border-t border-slate-200 pt-4">
      <label className="text-xs font-medium text-slate-700">Additional email for trial and billing notices</label>
      <div className="flex gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="accounts@yourcompany.com"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <button
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </button>
      </div>
      <p className={`text-xs ${msg ? (msg.ok ? "text-emerald-600" : "text-red-600") : "text-slate-500"}`}>
        {msg ? (
          <span className="inline-flex items-center gap-1">
            {msg.ok && <Check className="h-3.5 w-3.5" />}
            {msg.text}
          </span>
        ) : (
          "The owner admin's email always gets these too. Leave blank for none."
        )}
      </p>
    </form>
  );
}
