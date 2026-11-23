"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY } from "./admin/ui";

const INPUT =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all";

export default function ChangeAdminPasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next.length < 8) return setError("The new password must be at least 8 characters.");
    if (next !== confirm) return setError("The new password and its confirmation don't match.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not change the password.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      // Every admin session, this one included, is signed out by a password change: sign in with the new one.
      setTimeout(() => void signOut({ callbackUrl: "/login" }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">
        Current password
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">
        New password
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" className={INPUT} required />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700">
        Confirm new password
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} required />
      </label>
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {done && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Password changed. Everyone signed in with this account is being signed out. Sign in again with the new password.
        </div>
      )}
      <div>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Change password
        </button>
      </div>
    </form>
  );
}
