"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

export default function BulkAddEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [created, setCreated] = useState<
    | {
        name: string;
        employeeCode: string;
        pin: string;
      }[]
    | null
  >(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Parse CSV (simple split by newline and comma)
    const lines = csvText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const employeesToCreate = lines
      .map((line) => {
        const parts = line.split(",");
        const homeLatitude = parts[3]?.trim();
        const homeLongitude = parts[4]?.trim();
        const homeRadius = parts[5]?.trim();
        return {
          name: parts[0]?.trim(),
          email: parts[1]?.trim(),
          workMode: (parts[2]?.trim().toUpperCase() || "OFFICE") as
            "OFFICE" | "WFH" | "FIELD",
          homeLatitude: homeLatitude ? Number(homeLatitude) : undefined,
          homeLongitude: homeLongitude ? Number(homeLongitude) : undefined,
          homeRadiusMeters: homeRadius ? Number(homeRadius) : undefined,
        };
      })
      .filter((e) => e.name && e.email);

    if (employeesToCreate.length === 0) {
      setError(
        "No valid entries found. Please format as: Name, Email, WorkMode, HomeLatitude, HomeLongitude, HomeRadius",
      );
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
        className="inline-flex items-center gap-1.5 rounded-lg border-2 border-primary text-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 transition"
      >
        <Upload className="w-4 h-4" />
        Bulk Add
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="w-full max-w-2xl bg-surface-2 rounded-lg shadow-2xl p-6 border border-white/50">
            {created ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-medium text-foreground">
                  Employees created!
                </h2>
                <p className="text-sm text-muted">
                  Please copy or screenshot the PINs below. They will not be
                  shown again.
                </p>
                <div className="rounded-lg border border-border bg-surface max-h-96 overflow-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surface sticky top-0">
                      <tr>
                        <th className="px-4 py-3 font-medium text-muted">ID</th>
                        <th className="px-4 py-3 font-medium text-muted">
                          Name
                        </th>
                        <th className="px-4 py-3 font-medium text-muted">
                          PIN
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {created.map((c) => (
                        <tr key={c.employeeCode}>
                          <td className="px-4 py-3 font-medium">
                            {c.employeeCode}
                          </td>
                          <td className="px-4 py-3">{c.name}</td>
                          <td className="px-4 py-3 font-mono font-medium tracking-widest text-primary">
                            {c.pin}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={closeAll}
                  className="mt-2 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div>
                  <h2 className="text-xl font-medium text-foreground">
                    Bulk Add Employees
                  </h2>
                  <p className="text-sm text-muted mt-1">
                    Paste CSV data in the format:{" "}
                    <code className="bg-surface px-1 py-0.5 rounded text-secondary">
                      Name, Email, WorkMode(OFFICE/WFH/FIELD), HomeLatitude,
                      HomeLongitude, HomeRadius
                    </code>
                  </p>
                  <p className="text-xs text-muted mt-1">
                    The last four columns are optional — leave them blank for
                    OFFICE or FIELD employees. HomeLatitude/HomeLongitude are
                    required for WFH; HomeRadius defaults to 50 meters. FIELD
                    employees are never geofenced.
                  </p>
                </div>
                <div>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    required
                    rows={8}
                    placeholder={
                      "John Doe, john@example.com, OFFICE\n" +
                      "Jane Smith, jane@example.com, WFH, 12.9716, 77.5946, 75\n" +
                      "Alex Kim, alex@example.com, FIELD"
                    }
                    className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono"
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
                    className="flex-1 rounded-lg bg-white border border-border py-2.5 text-sm font-medium text-muted hover:bg-surface transition"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={loading}
                    className="flex-1 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition disabled:opacity-50"
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
