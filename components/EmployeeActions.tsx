"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [qrVersion, setQrVersion] = useState(0);

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
    }
    if (action === "regenerate-qr") {
      setQrVersion((v) => v + 1);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => call("regenerate-pin")}
          disabled={loading !== null}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
        >
          {loading === "regenerate-pin" ? "Generating…" : "Regenerate PIN"}
        </button>
        <button
          onClick={() => call("regenerate-qr")}
          disabled={loading !== null}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50"
        >
          {loading === "regenerate-qr" ? "Generating…" : "Regenerate QR Code"}
        </button>
        <button
          onClick={() => call("set-active", { active: !active })}
          disabled={loading !== null}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            active
              ? "border border-red-300 text-red-600 hover:bg-red-50"
              : "border border-emerald-300 text-emerald-600 hover:bg-emerald-50"
          }`}
        >
          {active ? "Deactivate" : "Reactivate"}
        </button>
      </div>

      {newPin && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500">New PIN (shown once)</p>
          <p className="text-3xl font-bold tracking-widest mt-1">{newPin}</p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">QR Badge</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={qrVersion}
          src={`/api/admin/employees/${employeeId}/qrcode?v=${qrVersion}`}
          alt="Employee QR code"
          className="w-48 h-48 rounded-lg border border-slate-200"
        />
      </div>
    </div>
  );
}
