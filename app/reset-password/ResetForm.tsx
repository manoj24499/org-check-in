"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ResetForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));

    if (!res.ok) {
      setLoading(false);
      if (data.error === "invalid_or_expired") setExpired(true);
      else setError(data.error ?? "Something went wrong.");
      return;
    }

    // Deliberately not signed in automatically: after a reset the admin
    // signs in with the new password themselves.
    router.push("/signin?reset=1");
  }

  if (expired) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
          This link is no longer valid.
        </p>
        <Link href="/forgot-password" className="text-sm text-primary-dark hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted">
        Resetting the password for <span className="text-foreground font-medium">{email}</span>.
      </p>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          placeholder="At least 8 characters"
        />
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
      <button
        disabled={loading || password.length < 8}
        className="mt-2 w-full rounded-lg border border-primary bg-transparent text-primary-dark py-3 px-4 text-sm font-medium flex items-center justify-between hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Saving…" : "Reset password"}
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
