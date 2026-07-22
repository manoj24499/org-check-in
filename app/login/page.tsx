"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [tab, setTab] = useState<"admin" | "employee">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAdminSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      router.push("/admin/dashboard");
      router.refresh();
    }
  }

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
      router.push("/my-page");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-center mb-6">Sign in</h1>

        <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
          <button
            onClick={() => { setTab("admin"); setError(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "admin" ? "bg-white shadow-sm" : "text-slate-500"
            }`}
          >
            Admin
          </button>
          <button
            onClick={() => { setTab("employee"); setError(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              tab === "employee" ? "bg-white shadow-sm" : "text-slate-500"
            }`}
          >
            Employee
          </button>
        </div>

        {tab === "admin" ? (
          <form onSubmit={handleAdminSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                name="password"
                type="password"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={loading}
              className="mt-2 rounded-lg bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in as Admin"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium">Employee ID</label>
              <input
                name="employeeCode"
                type="text"
                placeholder="EMP001"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">PIN</label>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={loading}
              className="mt-2 rounded-lg bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "View My Attendance"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
