"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LogIn, LogOut, Info, CheckCircle2, Loader2 } from "lucide-react";
import CameraCapture, { CameraCaptureHandle } from "@/components/CameraCapture";

type Result = { status: "idle" } | { status: "error"; message: string };

type EmployeeStatus = {
  exists: boolean;
  name?: string;
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt?: string | null;
};

export default function KioskPage() {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [empStatus, setEmpStatus] = useState<EmployeeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const router = useRouter();

  // Tick the clock every second. The initial paint stays null (set via a
  // deferred timer, not synchronously) so the server-rendered markup never
  // has to guess the client's wall-clock time.
  useEffect(() => {
    const tick = () => setCurrentTime(new Date());
    const interval = setInterval(tick, 1000);
    const kickoff = setTimeout(tick, 0);
    return () => {
      clearInterval(interval);
      clearTimeout(kickoff);
    };
  }, []);

  // As soon as a plausible employee ID is typed, look up today's status so the
  // kiosk can steer them to the right button and flag a forgotten check-out —
  // no PIN needed for this lightweight lookup.
  useEffect(() => {
    const code = employeeCode.trim();
    let cancelled = false;

    const timer = setTimeout(
      async () => {
        if (cancelled) return;
        if (code.length < 3) {
          setEmpStatus(null);
          setStatusLoading(false);
          return;
        }
        setStatusLoading(true);
        try {
          const res = await fetch(`/api/kiosk/status?employeeCode=${encodeURIComponent(code)}`);
          const data = await res.json();
          if (!cancelled) setEmpStatus(data);
        } catch {
          if (!cancelled) setEmpStatus(null);
        } finally {
          if (!cancelled) setStatusLoading(false);
        }
      },
      code.length < 3 ? 0 : 400,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [employeeCode]);

  const submit = useCallback(
    async (action: "CHECK_IN" | "CHECK_OUT", photo?: string) => {
      setBusy(true);
      try {
        const res = await fetch("/api/kiosk/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "pin", employeeCode, pin, action, photo }),
        });

        // A server error (e.g. a 500) may not come back as JSON at all — don't
        // let that masquerade as a "network" problem, which it isn't.
        let data: { id?: string; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          // fall through with an empty `data`
        }

        if (!res.ok) {
          setResult({
            status: "error",
            message: data.error ?? `Something went wrong (error ${res.status}). Please try again.`,
          });
          setBusy(false);
          setPin("");
          setTimeout(() => setResult({ status: "idle" }), 4000);
        } else if (data.id) {
          router.push(`/kiosk/status/${data.id}`);
        } else {
          setResult({ status: "error", message: "Unexpected response. Please try again." });
          setBusy(false);
          setPin("");
          setTimeout(() => setResult({ status: "idle" }), 4000);
        }
      } catch {
        setResult({ status: "error", message: "Network error. Please try again." });
        setBusy(false);
        setPin("");
        setTimeout(() => setResult({ status: "idle" }), 4000);
      }
    },
    [employeeCode, pin, router],
  );

  // Unknown / not-yet-looked-up employees default to a fresh state: Check In
  // open, Check Out closed — the common case for someone arriving for the day.
  // Check In additionally requires a working camera, since a photo is mandatory.
  const canCheckIn = (!empStatus?.exists || !empStatus.checkedIn) && cameraReady;
  const canCheckOut = Boolean(empStatus?.exists && empStatus.checkedIn && !empStatus.checkedOut);
  const formReady = employeeCode.trim().length > 0 && pin.length >= 4;

  function handleAction(action: "CHECK_IN" | "CHECK_OUT") {
    if (busy || !formReady) return;
    if (action === "CHECK_OUT") {
      if (!canCheckOut) return;
      submit(action);
      return;
    }
    if (!canCheckIn) return;
    const photo = cameraRef.current?.capture();
    if (!photo) {
      setResult({
        status: "error",
        message: "Camera isn't ready yet. Please wait a moment and try again.",
      });
      setTimeout(() => setResult({ status: "idle" }), 4000);
      return;
    }
    submit(action, photo);
  }

  function handlePinKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (canCheckOut) handleAction("CHECK_OUT");
    else if (canCheckIn) handleAction("CHECK_IN");
  }

  const firstName = empStatus?.name?.split(" ")[0];
  const notice =
    empStatus?.exists && empStatus.checkedIn && !empStatus.checkedOut
      ? {
          tone: "info" as const,
          message: `Hi ${firstName ?? "there"}, you're already checked in${
            empStatus.checkInAt
              ? ` since ${new Date(empStatus.checkInAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""
          }. Don't forget to check out!`,
        }
      : empStatus?.exists && empStatus.checkedIn && empStatus.checkedOut
        ? {
            tone: "done" as const,
            message: `${firstName ?? "You've"} completed today's attendance. See you tomorrow!`,
          }
        : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-6 left-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors font-medium px-4 py-2 rounded-lg hover:bg-slate-200 bg-slate-100/50"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Start</span>
        </Link>
      </div>

      <div
        className={`fixed top-6 right-6 z-20 w-72 rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 ${
          notice ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6 pointer-events-none"
        } ${notice?.tone === "done" ? "bg-emerald-50/95 border-emerald-200" : "bg-primary/10 border-primary/20"}`}
      >
        {notice && (
          <div className="flex items-start gap-3">
            {notice.tone === "done" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            )}
            <p
              className={`text-sm font-medium ${
                notice.tone === "done" ? "text-emerald-800" : "text-primary"
              }`}
            >
              {notice.message}
            </p>
          </div>
        )}
      </div>

      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold text-slate-900">Employee Check-In System</h1>
        {currentTime && (
          <p className="text-xl text-slate-500 font-medium mt-2 tabular-nums">
            {currentTime.toLocaleDateString([], {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}{" "}
            &middot;{" "}
            {currentTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        )}
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">Presence photo</label>
              {!cameraReady && (
                <span className="text-xs text-slate-400">Preparing camera…</span>
              )}
            </div>
            <CameraCapture ref={cameraRef} onReadyChange={setCameraReady} />
            <p className="text-xs text-slate-400 mt-1.5">
              Required to check in, so we know who&apos;s actually present.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Employee ID</label>
            <div className="relative mt-1">
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP001"
                className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg tracking-wide"
                autoFocus
              />
              {statusLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handlePinKeyDown}
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-2xl tracking-[0.5em]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => handleAction("CHECK_IN")}
              disabled={busy || !formReady || !canCheckIn}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary text-white py-3 font-medium hover:bg-primary-dark transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
            >
              <LogIn className="w-4 h-4" />
              {busy ? "Processing…" : "Check In"}
            </button>
            <button
              type="button"
              onClick={() => handleAction("CHECK_OUT")}
              disabled={busy || !formReady || !canCheckOut}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 text-white py-3 font-medium hover:bg-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
              {busy ? "Processing…" : "Check Out"}
            </button>
          </div>
        </div>
      </div>

      <div className="h-20 flex items-center">
        {result.status === "error" && (
          <div className="rounded-xl px-6 py-4 text-center font-medium bg-red-50 text-red-700 border border-red-200">
            {result.message}
          </div>
        )}
      </div>
    </main>
  );
}
