"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const fmt = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** Admin: see, set, correct or clear an employee's date of birth. */
export default function EmployeeDobEditor({ employeeId, value }: { employeeId: string; value: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(value ?? "");
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function send(next: string | null) {
    setBusy(next === null ? "clear" : "save");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-date-of-birth", dateOfBirth: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? `Something went wrong (error ${res.status}).` });
      } else {
        if (next === null) setDate("");
        setMessage({ tone: "ok", text: next === null ? "Date of birth cleared. The employee will be asked for it again." : "Saved." });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Network error. Please try again." });
    }
    setBusy(null);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-700">
        {value ? (
          <>
            Currently <strong>{fmt(value)}</strong>
          </>
        ) : (
          <span className="text-slate-500">Not given yet. The employee is asked for it each time they open My Page.</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          min="1940-01-01"
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="button"
          disabled={busy !== null || !date || date === value}
          onClick={() => void send(date)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1d1f26] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
        {value && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void send(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            {busy === "clear" && <Loader2 className="h-4 w-4 animate-spin" />}
            Clear
          </button>
        )}
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.tone === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
