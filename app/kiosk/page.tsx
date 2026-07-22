"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";

const QrScanner = dynamic(() => import("@/components/QrScanner"), { ssr: false });

type Result =
  | { status: "idle" }
  | { status: "success"; name: string; type: "CHECK_IN" | "CHECK_OUT"; timestamp: string }
  | { status: "error"; message: string };

export default function KioskPage() {
  const [mode, setMode] = useState<"qr" | "pin">("qr");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ status: "idle" });

  const submit = useCallback(async (body: Record<string, string>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/kiosk/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ status: "error", message: data.error ?? "Something went wrong." });
      } else {
        setResult({
          status: "success",
          name: data.name,
          type: data.type,
          timestamp: data.timestamp,
        });
      }
    } catch {
      setResult({ status: "error", message: "Network error. Please try again." });
    } finally {
      setBusy(false);
      setEmployeeCode("");
      setPin("");
      setTimeout(() => setResult({ status: "idle" }), 4000);
    }
  }, []);

  const handleQrScan = useCallback(
    (decodedText: string) => {
      if (busy) return;
      submit({ mode: "qr", qrToken: decodedText });
    },
    [busy, submit]
  );

  function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeCode || pin.length < 4) return;
    submit({ mode: "pin", employeeCode, pin });
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-2xl font-bold">Employee Check-In / Check-Out</h1>

      <div className="flex rounded-lg bg-slate-100 p-1">
        <button
          onClick={() => setMode("qr")}
          className={`px-6 py-2 rounded-md text-sm font-medium transition ${
            mode === "qr" ? "bg-white shadow-sm" : "text-slate-500"
          }`}
        >
          Scan QR
        </button>
        <button
          onClick={() => setMode("pin")}
          className={`px-6 py-2 rounded-md text-sm font-medium transition ${
            mode === "pin" ? "bg-white shadow-sm" : "text-slate-500"
          }`}
        >
          Enter PIN
        </button>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {mode === "qr" ? (
          <QrScanner onScan={handleQrScan} paused={busy} />
        ) : (
          <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium">Employee ID</label>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP001"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg tracking-wide"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium">PIN</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em]"
              />
            </div>
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 text-white py-3 font-medium hover:bg-slate-700 transition disabled:opacity-50"
            >
              {busy ? "Processing…" : "Submit"}
            </button>
          </form>
        )}
      </div>

      <div className="h-20 flex items-center">
        {result.status === "success" && (
          <div
            className={`rounded-xl px-6 py-4 text-center font-medium ${
              result.type === "CHECK_IN"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {result.name} —{" "}
            {result.type === "CHECK_IN" ? "Checked in" : "Checked out"} at{" "}
            {new Date(result.timestamp).toLocaleTimeString()}
          </div>
        )}
        {result.status === "error" && (
          <div className="rounded-xl px-6 py-4 text-center font-medium bg-red-50 text-red-700 border border-red-200">
            {result.message}
          </div>
        )}
      </div>
    </main>
  );
}
