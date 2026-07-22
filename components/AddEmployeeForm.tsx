"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    name: string;
    employeeCode: string;
    pin: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
      }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setCreated(data);
    router.refresh();
  }

  function closeAll() {
    setOpen(false);
    setCreated(null);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-dark transition shadow-md shadow-primary/20"
      >
        + Add Employee
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6">
            {created ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Employee created</h2>
                <p className="text-sm text-slate-500">
                  Share this PIN with {created.name} now — it won&apos;t be shown
                  again. You can always issue a new one from their profile.
                </p>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs text-slate-500">{created.employeeCode}</p>
                  <p className="text-3xl font-bold tracking-widest mt-1">{created.pin}</p>
                </div>
                <button
                  onClick={closeAll}
                  className="rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary-dark transition shadow-md shadow-primary/20"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Add Employee</h2>
                <div>
                  <label className="text-sm font-medium">Full name</label>
                  <input
                    name="name"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={closeAll}
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    className="flex-1 rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary-dark transition shadow-md shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    {loading ? "Creating…" : "Create"}
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
