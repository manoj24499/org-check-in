"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { Logo } from "@/components/Logo";

/**
 * The customer-facing sign-in the marketing site's "Sign in" and "Yes, sign
 * me in" (app/plans) links point at — distinct from app/login/admin, which
 * is the internal admin-only login reached from /login's employee/admin
 * picker. Same underlying admin-login credential check either way; this one
 * exists so a visitor arriving from the marketing site doesn't land on a
 * page framed as "Restricted" for internal use.
 */
export default function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await signIn("admin-login", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      sessionStorage.setItem("tab_auth", "true");
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />

        <div className="mt-2 flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            Welcome back
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground flex items-center gap-2.5">
            <LogIn className="w-[22px] h-[22px] text-primary" />
            Sign in
          </h1>
          <p className="text-sm text-muted">Manage your workspace, employees, and plan.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Email</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="you@company.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="••••••••"
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
            {loading ? "Signing in…" : "Sign in"}
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-xs text-center text-muted">
            Don&apos;t have a workspace yet?{" "}
            <Link href="/plans" className="text-primary-dark hover:underline">
              Get started
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
