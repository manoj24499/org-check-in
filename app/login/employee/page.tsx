"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-slate-100 p-10">
        <h1 className="text-2xl font-bold text-center mb-2 text-slate-900">Employee Portal</h1>
        <p className="text-center text-slate-500 mb-8 text-sm">View your attendance and details</p>

        <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-5">
          <div>
            <label className="text-sm font-semibold text-slate-700">Employee ID</label>
            <input
              name="employeeCode"
              type="text"
              required
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
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
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-4 py-3 text-2xl tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
              placeholder="••••"
            />
          </div>
          
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
          
          <button
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-slate-900 text-white py-3.5 text-sm font-bold hover:bg-slate-800 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Access Portal"}
          </button>
        </form>
      </div>
    </main>
  );
}
