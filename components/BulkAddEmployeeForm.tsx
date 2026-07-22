"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkAddEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [created, setCreated] = useState<{
    name: string;
    employeeCode: string;
    pin: string;
  }[] | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Parse CSV (simple split by newline and comma)
    const lines = csvText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const employeesToCreate = lines.map(line => {
      const parts = line.split(",");
      return {
        name: parts[0]?.trim(),
        email: parts[1]?.trim()
      };
    }).filter(e => e.name && e.email);

    if (employeesToCreate.length === 0) {
      setError("No valid entries found. Please format as: Name, Email");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/employees/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeesToCreate),
    });
    
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setCreated(data.created);
    router.refresh();
  }

  function closeAll() {
    setOpen(false);
    setCreated(null);
    setError(null);
    setCsvText("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border-2 border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 transition"
      >
        Bulk Add
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="w-full max-w-2xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-white/50">
            {created ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold text-slate-800">Employees created!</h2>
                <p className="text-sm text-slate-500">
                  Please copy or screenshot the PINs below. They will not be shown again.
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 max-h-96 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-100/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-medium text-slate-600">ID</th>
                        <th className="px-4 py-3 font-medium text-slate-600">Name</th>
                        <th className="px-4 py-3 font-medium text-slate-600">PIN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {created.map(c => (
                        <tr key={c.employeeCode}>
                          <td className="px-4 py-3 font-medium">{c.employeeCode}</td>
                          <td className="px-4 py-3">{c.name}</td>
                          <td className="px-4 py-3 font-mono font-bold tracking-widest text-primary">{c.pin}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={closeAll}
                  className="mt-2 rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors shadow-md shadow-primary/20"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Bulk Add Employees</h2>
                  <p className="text-sm text-slate-500 mt-1">Paste CSV data in the format: <code className="bg-slate-100 px-1 py-0.5 rounded text-secondary">Name, Email</code></p>
                </div>
                <div>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    required
                    rows={8}
                    placeholder="John Doe, john@example.com&#10;Jane Smith, jane@example.com"
                    className="w-full rounded-xl border border-slate-200 bg-white/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
                  />
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
                    {error}
                  </div>
                )}
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={closeAll}
                    className="flex-1 rounded-lg bg-white border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    className="flex-1 rounded-lg bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary/90 transition shadow-md shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    {loading ? "Processing..." : "Create Employees"}
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
