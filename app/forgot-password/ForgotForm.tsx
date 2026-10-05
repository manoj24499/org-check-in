"use client";

import { useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-6 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-5 w-5" />
        </span>
        <p className="text-[15px] font-medium text-foreground">Check your inbox</p>
        <p className="text-sm text-muted">
          If that email belongs to an admin account, a reset link is on its way. It expires in 60 minutes.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-xs font-medium text-primary-dark hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="forgot-email" className="text-xs text-muted">
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          placeholder="you@company.com"
        />
      </div>
      <button
        disabled={loading}
        className="mt-1 w-full rounded-lg bg-foreground text-white py-3 px-4 text-sm font-medium flex items-center justify-between hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Sending…" : "Send reset link"}
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
