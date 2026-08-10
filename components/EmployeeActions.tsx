"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Power, Copy, Check } from "lucide-react";

export default function EmployeeActions({
  employeeId,
  active,
}: {
  employeeId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function call(action: string, extra?: Record<string, unknown>) {
    setLoading(action);
    const res = await fetch(`/api/admin/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setLoading(null);

    if (action === "regenerate-pin" && data.pin) {
      setNewPin(data.pin);
      setCopied(false);
    }
    router.refresh();
  }

  async function copyPin() {
    if (!newPin) return;
    await navigator.clipboard.writeText(newPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => call("regenerate-pin")}
          disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface transition disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          {loading === "regenerate-pin" ? "Generating…" : "Regenerate PIN"}
        </button>
        <button
          onClick={() => call("set-active", { active: !active })}
          disabled={loading !== null}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            active
              ? "border border-red-300 text-red-600 hover:bg-red-50"
              : "border border-emerald-300 text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          <Power className="w-4 h-4" />
          {active ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      {newPin && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
          <p className="text-xs text-secondary font-medium">
            New PIN (shown once)
          </p>
          <p className="text-3xl font-medium tracking-widest mt-1 text-foreground">
            {newPin}
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
      )}
    </div>
  );
}
