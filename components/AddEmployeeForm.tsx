"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check } from "lucide-react";

export interface ShiftOption {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
}

function formatTimeLabel(value: string) {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function AddEmployeeForm({ shifts }: { shifts: ShiftOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{
    name: string;
    employeeCode: string;
    pin: string;
    shift: { name: string | null; startTime: string; endTime: string } | null;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const shiftId = form.get("shiftId");

    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        shiftId: shiftId ? shiftId : undefined,
      }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
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
    setCopied(false);
  }

  async function copyPin() {
    if (!created) return;
    await navigator.clipboard.writeText(created.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-transparent text-primary-dark px-4 py-2 text-sm font-medium hover:bg-primary/5 transition"
      >
        <Plus className="w-4 h-4" />
        Add Employee
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-surface-2 rounded-lg shadow-2xl p-6 border border-white/50">
            {created ? (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-medium text-foreground">
                  Employee created!
                </h2>
                <p className="text-sm text-muted">
                  Share this PIN with {created.name} now — it won&apos;t be
                  shown again. You can always issue a new one from their
                  profile.
                </p>
                {created.shift && (
                  <p className="text-xs text-secondary -mt-2">
                    Assigned to {created.shift.name || "shift"} (
                    {formatTimeLabel(created.shift.startTime)}–{formatTimeLabel(created.shift.endTime)}) every day —
                    fine-tune specific days anytime from their profile.
                  </p>
                )}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                  <p className="text-xs text-secondary font-medium">
                    {created.employeeCode}
                  </p>
                  <p className="text-3xl font-medium tracking-widest mt-1 text-foreground">
                    {created.pin}
                  </p>
                  <button
                    onClick={copyPin}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/10 transition"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? "Copied" : "Copy PIN"}
                  </button>
                </div>
                <button
                  onClick={closeAll}
                  className="rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <h2 className="text-xl font-medium text-foreground">
                  Add Employee
                </h2>
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Full name
                  </label>
                  <input
                    name="name"
                    required
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Shift (optional)
                  </label>
                  <select
                    name="shiftId"
                    defaultValue=""
                    disabled={shifts.length === 0}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all disabled:opacity-50"
                  >
                    <option value="">No shift for now</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || formatTimeLabel(s.startTime)} ({formatTimeLabel(s.startTime)}–
                        {formatTimeLabel(s.endTime)})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-secondary mt-1">
                    {shifts.length === 0
                      ? "No shifts exist yet — create one from Shifts first if needed."
                      : "Applies to every day of the week — adjust individual days later from their profile."}
                  </p>
                </div>
                {error && (
                  <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
                    {error}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
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
