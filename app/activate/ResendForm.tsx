"use client";

import { useState } from "react";

/**
 * Deliberately doesn't reflect whether the email actually matched anything
 * — the API always responds { ok: true } regardless (see
 * app/api/activate/resend/route.ts), so there's nothing more specific to
 * show here without contradicting that.
 */
export default function ResendForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/activate/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm text-muted">
        If that email has a pending activation, we&apos;ve sent a new link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-xs text-muted">Resend the activation link</label>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
        <button
          disabled={loading}
          className="rounded-lg border border-primary text-primary-dark px-3 py-2 text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50"
        >
          {loading ? "Sending…" : "Resend"}
        </button>
      </div>
    </form>
  );
}
