"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";

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
    <main className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div aria-hidden className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute top-6 left-6">
        <Link
          href="/login"
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium px-4 py-2 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </Link>
      </div>

      <div className="relative w-full max-w-sm bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/40 border border-white/60 p-10">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 mx-auto mb-5">
          <User className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-900">Employee Portal</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">View your attendance and details</p>

        <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-sm font-semibold text-slate-700">Employee ID</label>
            <input
              name="employeeCode"
              type="text"
              required
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="EMP001"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700">PIN</label>
            <input
              name="pin"
              type="password"
              inputMode="numeric"
              required
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-2xl tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="••••"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

          <button
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-primary text-white py-3.5 text-sm font-bold hover:bg-primary-dark transition-colors shadow-md shadow-primary/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Access Portal"}
          </button>
        </form>
      </div>
    </main>
  );
}
