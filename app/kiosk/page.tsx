"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LogIn,
  LogOut,
  Info,
  CheckCircle2,
  Loader2,
  MapPin,
  CalendarDays,
  Sparkles,
  Camera,
  Lock,
} from "lucide-react";
import CameraCapture, { CameraCaptureHandle } from "@/components/CameraCapture";
import { startTracking, stopTracking } from "@/lib/locationTracker";
import { haversineDistanceMeters } from "@/lib/geofence";

type Result = { status: "idle" } | { status: "error"; message: string };

type OfficeLocationInfo = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
} | null;

type GeofenceStatus = { distanceMeters: number; withinRadius: boolean } | null;

type EmployeeStatus = {
  exists: boolean;
  name?: string;
  workMode?: "OFFICE" | "WFH";
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt?: string | null;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Purely decorative — the current month with today highlighted. No
// per-employee data here: the kiosk is a shared, unauthenticated device, so
// nothing tied to a specific employee is shown before their PIN is verified.
function buildMonthCells(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function KioskPage() {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [empStatus, setEmpStatus] = useState<EmployeeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [trackingPopupId, setTrackingPopupId] = useState<string | null>(null);
  const [officeLocation, setOfficeLocation] = useState<OfficeLocationInfo>(null);
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>(null);
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const router = useRouter();

  // Fetched once so the distance indicator can be shown as soon as a GPS fix
  // comes in — this is purely informational, the server remains the gate.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/kiosk/office-location")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setOfficeLocation(data.officeLocation ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    async (
      action: "CHECK_IN" | "CHECK_OUT",
      photo?: string,
      coords?: { latitude: number; longitude: number },
    ) => {
      setBusy(true);
      try {
        const res = await fetch("/api/kiosk/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "pin",
            employeeCode,
            pin,
            action,
            photo,
            latitude: coords?.latitude,
            longitude: coords?.longitude,
          }),
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
          if (action === "CHECK_IN") {
            // Start the 5-minute location ping loop, then let the employee
            // acknowledge the tracking notice before moving on.
            startTracking(data.id);
            setBusy(false);
            setPin("");
            setTrackingPopupId(data.id);
          } else {
            stopTracking();
            router.push(`/kiosk/status/${data.id}`);
          }
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

  async function handleAction(action: "CHECK_IN" | "CHECK_OUT") {
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

    // Location permission is requested (and required) before the check-in
    // completes — live tracking only ever starts after this succeeds.
    setBusy(true);
    let position: GeolocationPosition;
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("unsupported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        });
      });
    } catch (err) {
      setBusy(false);
      const denied =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as GeolocationPositionError).code === 1;
      setResult({
        status: "error",
        message: denied
          ? "Location permission is required to check in."
          : "Unable to get your location. Please enable location services and try again.",
      });
      setTimeout(() => setResult({ status: "idle" }), 4000);
      return;
    }

    const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    // WFH employees are checked against their home location, which is
    // personal data — never fetched to the client, so no pill is shown for
    // them. The server-side check-in gate still applies regardless.
    if (officeLocation && empStatus?.workMode !== "WFH") {
      const distanceMeters = haversineDistanceMeters(
        coords.latitude,
        coords.longitude,
        officeLocation.latitude,
        officeLocation.longitude,
      );
      setGeofenceStatus({ distanceMeters, withinRadius: distanceMeters <= officeLocation.radiusMeters });
    } else {
      setGeofenceStatus(null);
    }

    submit(action, photo, coords);
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
    <main className="min-h-screen flex flex-col items-center p-6 bg-gradient-to-b from-slate-50 via-white to-slate-50 relative overflow-hidden">
      <div aria-hidden className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />

      <div className="absolute top-6 left-6 z-10">
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

      <div className="relative w-full max-w-5xl flex flex-col items-center gap-8 pt-14">
        <h1 className="text-3xl font-bold text-slate-900 text-center">
          Employee Check-In System
        </h1>

        <div className="w-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="flex flex-col items-center gap-4">
            <div className="w-full max-w-sm bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 border border-white/60 p-6">
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

                {geofenceStatus && (
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                      geofenceStatus.withinRadius
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        geofenceStatus.withinRadius ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    {Math.round(geofenceStatus.distanceMeters)}m from the office
                    {geofenceStatus.withinRadius ? " — within range" : " — outside allowed range"}
                  </div>
                )}
              </div>
            </div>

            <div className="h-20 flex items-center">
              {result.status === "error" && (
                <div className="rounded-xl px-6 py-4 text-center font-medium bg-red-50 text-red-700 border border-red-200">
                  {result.message}
                </div>
              )}
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl shadow-slate-200/40 p-6 text-center">
              {currentTime ? (
                <>
                  <p className="text-4xl font-black text-slate-900 tabular-nums tracking-tight">
                    {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-sm text-secondary font-medium mt-1">
                    {currentTime.toLocaleDateString([], {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </>
              ) : (
                <div className="h-[52px]" />
              )}
            </div>

            {currentTime && (
              <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl shadow-slate-200/40 p-5">
                <p className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  {currentTime.toLocaleDateString([], { month: "long", year: "numeric" })}
                </p>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-secondary uppercase mb-1.5">
                  {WEEKDAY_LABELS.map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {buildMonthCells(currentTime).map((day, i) => (
                    <div
                      key={i}
                      className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium ${
                        day === currentTime.getDate()
                          ? "bg-primary text-white font-bold"
                          : day
                            ? "text-slate-600"
                            : ""
                      }`}
                    >
                      {day ?? ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white/80 backdrop-blur-xl border border-white/60 shadow-xl shadow-slate-200/40 p-5">
              <p className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Quick Tips
              </p>
              <ul className="flex flex-col gap-2.5 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <Camera className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Look at the camera so we can confirm you&apos;re present.
                </li>
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Allow location access when prompted to complete check-in.
                </li>
                <li className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  Keep your PIN private — never share it with anyone.
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {trackingPopupId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="w-7 h-7" />
            </div>
            <p className="text-slate-700 font-medium">
              Live location tracking has started. Please keep this tab open and keep location
              services enabled during your working hours. Closing this tab will stop live
              location tracking.
            </p>
            <button
              onClick={() => {
                const id = trackingPopupId;
                setTrackingPopupId(null);
                router.push(`/kiosk/status/${id}`);
              }}
              className="w-full rounded-xl bg-primary text-white py-3 font-semibold hover:bg-primary-dark transition shadow-md shadow-primary/20"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
