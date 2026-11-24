"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Monitor, Trash2, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD, EmptyState, Pill } from "./admin/ui";

type Device = {
  id: string;
  name: string;
  paired: boolean;
  pairedAt: string | null;
  lastUsedAt: string | null;
  pairingExpiresAt: string | null;
  /** Worked out on the server: not paired yet, and the code hasn't expired. */
  codeActive: boolean;
};

const when = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const INPUT =
  "rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all";

export default function KioskDevicesPanel({ devices, kioskPath }: { devices: Device[]; kioskPath: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; code: string; minutes: number } | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("add");
    try {
      const res = await fetch("/api/admin/kiosk-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not add the kiosk.");
      setIssued({ name: name.trim(), code: data.code, minutes: data.expiresInMinutes });
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the kiosk.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(d: Device) {
    if (!window.confirm(`Remove "${d.name}"? That kiosk will stop checking people in until it is paired again.`)) return;
    setError(null);
    setBusy(d.id);
    try {
      const res = await fetch(`/api/admin/kiosk-devices/${d.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not remove it.");
      if (issued?.name === d.name) setIssued(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove it.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-5`}>
        <h2 className="text-[15px] font-semibold text-slate-900">Add a kiosk</h2>
        <p className="mt-1 max-w-2xl text-[13px] text-slate-500">
          Name the PC or tablet, then enter the code on it: open <span className="font-medium text-slate-700">{kioskPath}</span>,
          choose <span className="font-medium text-slate-700">Pair this kiosk</span> and type the code. The code works once and
          expires after 15 minutes. A paired kiosk counts as being at the office, so it does not need the browser&apos;s location.
        </p>
        <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reception PC" maxLength={60} className={`${INPUT} w-64`} required />
          <button type="submit" disabled={busy !== null} className={BTN_PRIMARY}>
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Get pairing code
          </button>
        </form>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {issued && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-[13px] text-emerald-900">
              Pairing code for <span className="font-semibold">{issued.name}</span> (shown only now, valid {issued.minutes} minutes):
            </p>
            <p className="mt-1 select-all font-mono text-[28px] font-semibold tracking-[0.25em] text-emerald-900">{issued.code}</p>
          </div>
        )}
      </div>

      {devices.length === 0 ? (
        <div className={CARD}>
          <EmptyState icon={Monitor} title="No kiosks yet" text="Add the kiosk PC or tablet above to get its pairing code." />
        </div>
      ) : (
        <ul className={`${CARD} divide-y divide-black/[0.06] overflow-hidden`}>
          {devices.map((d) => {
            const waiting = d.codeActive;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Monitor className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14.5px] font-semibold text-slate-900">{d.name}</p>
                    {d.paired ? <Pill tone="green">Paired</Pill> : waiting ? <Pill tone="amber">Waiting to pair</Pill> : <Pill tone="slate">Code expired</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {d.paired
                      ? `Paired ${d.pairedAt ? when.format(new Date(d.pairedAt)) : ""}${d.lastUsedAt ? ` · last used ${when.format(new Date(d.lastUsedAt))}` : ""}`
                      : waiting
                        ? `Code valid until ${when.format(new Date(d.pairingExpiresAt!))}`
                        : "Remove it and add the kiosk again to get a new code."}
                  </p>
                </div>
                <button type="button" onClick={() => remove(d)} disabled={busy !== null} className={BTN_SECONDARY}>
                  {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
