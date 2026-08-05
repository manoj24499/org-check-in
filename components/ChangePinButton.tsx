"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export default function ChangePinButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const currentPin = String(form.get("currentPin") ?? "");
    const newPin = String(form.get("newPin") ?? "");
    const confirmPin = String(form.get("confirmPin") ?? "");

    if (newPin !== confirmPin) {
      setLoading(false);
      setError("PINs don't match.");
      return;
    }

    const res = await fetch("/api/my-page/change-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin, newPin }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setDone(true);
  }

  function closeAll() {
    setOpen(false);
    setDone(false);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <KeyRound className="w-4 h-4" />
        <span className="hidden sm:inline">Change PIN</span>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/50">
            {done ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold text-slate-800">PIN updated</h2>
                <p className="text-sm text-slate-500">
                  Use your new PIN the next time you sign in.
                </p>
                <button
                  onClick={closeAll}
                  className="rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary-dark transition shadow-md shadow-primary/20"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <h2 className="text-xl font-bold text-slate-800">Change PIN</h2>
                <p className="text-sm text-slate-500 -mt-2">Choose a PIN only you know — 4 to 10 digits.</p>
                <div>
                  <label className="text-sm font-medium text-slate-700">Current PIN</label>
                  <input
                    name="currentPin"
                    type="password"
                    inputMode="numeric"
                    required
                    minLength={4}
                    maxLength={10}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">New PIN</label>
                  <input
                    name="newPin"
                    type="password"
                    inputMode="numeric"
                    required
                    minLength={4}
                    maxLength={10}
                    pattern="\d{4,10}"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Confirm new PIN</label>
                  <input
                    name="confirmPin"
                    type="password"
                    inputMode="numeric"
                    required
                    minLength={4}
                    maxLength={10}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
                    {error}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={closeAll}
                    className="flex-1 rounded-lg bg-white border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    className="flex-1 rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary-dark transition shadow-md shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    {loading ? "Updating…" : "Update PIN"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
