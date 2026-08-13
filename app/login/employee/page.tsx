"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function EmployeeLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleEmployeeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await signIn("employee-login", {
      employeeCode: form.get("employeeCode"),
      pin: form.get("pin"),
      redirect: false,
    });

    setLoading(false);
    if (res?.error) {
      setError("Invalid employee ID or PIN.");
    } else {
      sessionStorage.setItem("tab_auth", "true");
      router.push("/my-page");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back
        </Link>

        <div className="mt-7 flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            Employee portal
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground flex items-center gap-2.5">
            <User className="w-[22px] h-[22px] text-primary" />
            Sign in
          </h1>
        </div>

        <form onSubmit={handleEmployeeSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Employee ID</label>
            <input
              name="employeeCode"
              type="text"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="EMP001"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">PIN</label>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xl tracking-[0.3em] text-center text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          <button
            disabled={loading}
            className="mt-2 w-full rounded-lg border border-primary bg-transparent text-primary-dark py-3 px-4 text-sm font-medium flex items-center justify-between hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Access portal"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
