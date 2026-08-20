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
  Lock,
  Delete,
  Home,
  Building2,
} from "lucide-react";
import CameraCapture, { CameraCaptureHandle } from "@/components/CameraCapture";
import { startTracking, stopTracking } from "@/lib/locationTracker";
import { haversineDistanceMeters } from "@/lib/geofence";
import { Logo } from "@/components/Logo";

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
  workMode?: "OFFICE" | "WFH" | "FIELD";
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt?: string | null;
  checkOutPhotoRequired?: boolean;
};

const PIN_SLOTS = 6;
const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

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
  // A WFH employee's choice for today — "Where are you today?" (see the
  // toggle rendered below). Defaults to Home, preserving today's behavior
  // for anyone who never touches it. Reset whenever the typed employee code
  // changes so it can't carry over from whoever was there before.
  const [wfhCheckInMode, setWfhCheckInMode] = useState<"HOME" | "OFFICE">("HOME");
  const [kioskCoords, setKioskCoords] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
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

  // Fetched once on load, not per keystroke — the pre-PIN status lookup
  // below needs this to prove the kiosk is physically near the employee's
  // assigned location (the server rejects that lookup without it). A fixed
  // kiosk device only ever has to grant this permission once; if it's
  // denied or unavailable, the lookup below simply skips the personalized
  // greeting — the actual check-in/check-out button still works, since
  // handleAction() gets its own independent, authoritative location fix.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setKioskCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
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
          const params = new URLSearchParams({ employeeCode: code });
          if (kioskCoords) {
            params.set("latitude", String(kioskCoords.latitude));
            params.set("longitude", String(kioskCoords.longitude));
          }
          const res = await fetch(`/api/kiosk/status?${params.toString()}`);
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
    // Re-runs once kioskCoords resolves too, so a lookup that already fired
    // without them (geolocation hadn't returned yet) retries with them as
    // soon as they're available, instead of being stuck without the
    // personalized greeting for the rest of that employee's session.
  }, [employeeCode, kioskCoords]);

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
            // Only meaningful to the server for CHECK_IN, and only when the
            // employee actually chose Office — omitting it otherwise keeps
            // every other profile's default behavior untouched.
            checkInMode: action === "CHECK_IN" && wfhCheckInMode === "OFFICE" ? "OFFICE" : undefined,
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
    [employeeCode, pin, router, wfhCheckInMode],
  );

  // Unknown / not-yet-looked-up employees default to a fresh state: Check In
  // open, Check Out closed — the common case for someone arriving for the day.
  const checkOutPhotoRequired = Boolean(empStatus?.checkOutPhotoRequired);
  // Whether checking in is still a live option today, independent of the
  // camera — used to gate the WFH mode toggle below, which is a decision an
  // employee can make before the camera's even warmed up. Check In itself
  // additionally requires a working camera, since a photo is mandatory.
  const notYetCheckedIn = !empStatus?.exists || !empStatus.checkedIn;
  const canCheckIn = notYetCheckedIn && cameraReady;
  const canCheckOut =
    Boolean(empStatus?.exists && empStatus.checkedIn && !empStatus.checkedOut) &&
    (!checkOutPhotoRequired || cameraReady);
  const formReady = employeeCode.trim().length > 0 && pin.length >= 4;

  async function handleAction(action: "CHECK_IN" | "CHECK_OUT") {
    if (busy || !formReady) return;
    if (action === "CHECK_OUT") {
      if (!canCheckOut) return;
      if (!checkOutPhotoRequired) {
        submit(action);
        return;
      }
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
    // WFH employees are normally checked against their home location, which
    // is personal data never fetched to the client, so no pill is shown for
    // them — unless they picked "Office" for today (the toggle below), in
    // which case they're geofenced against the office same as anyone else
    // and the distance pill is just as useful. FIELD employees aren't
    // geofenced at all. The server-side check-in gate still applies
    // regardless of what this pill shows.
    const checkingAgainstOffice =
      empStatus?.workMode === "OFFICE" || (empStatus?.workMode === "WFH" && wfhCheckInMode === "OFFICE");
    if (officeLocation && checkingAgainstOffice) {
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

  function pressKey(key: (typeof KEYPAD_KEYS)[number]) {
    if (busy) return;
    if (key === "clear") {
      setPin("");
      return;
    }
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => (p.length >= PIN_SLOTS ? p : p + key));
  }

  const firstName = empStatus?.name?.split(" ")[0];
  const notice =
    empStatus?.exists && empStatus.checkedIn && !empStatus.checkedOut
      ? {
          tone: "info" as const,
          message: `Hi ${firstName ?? "there"} — checked in since ${
            empStatus.checkInAt
              ? new Date(empStatus.checkInAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "earlier"
          }. Don't forget to check out.`,
        }
      : empStatus?.exists && empStatus.checkedIn && empStatus.checkedOut
        ? {
            tone: "done" as const,
            message: `${firstName ?? "You've"} completed today's attendance. See you tomorrow!`,
          }
        : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
      <div className="w-full max-w-[1024px] rounded-lg border border-border bg-surface overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_400px]">
        {/* Left pane */}
        <div className="flex flex-col p-5 sm:p-7 gap-4">
          <div className="flex items-center gap-2">
            <Logo variant="static" size={18} className="text-foreground" />
            <span className="text-xs font-medium tracking-[0.12em] uppercase text-muted">
              Kiosk
            </span>
            <Link
              href="/"
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-[15px] h-[15px]" />
              Back to start
            </Link>
          </div>

          <div>
            {currentTime ? (
              <>
                <div className="text-[44px] sm:text-[52px] font-medium leading-none tracking-[-0.03em] tabular-nums text-foreground">
                  {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="text-sm text-muted mt-1">
                  {currentTime.toLocaleDateString([], {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </>
            ) : (
              <div className="h-[64px]" />
            )}
          </div>

          {(notice || result.status === "error") && (
            <div
              className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
                result.status === "error"
                  ? "bg-red-50 border-red-200 text-red-700"
                  : notice?.tone === "done"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-primary/[0.08] border-primary/30 text-[#8a4a10]"
              }`}
            >
              {result.status === "error" ? (
                <Info className="w-[18px] h-[18px] shrink-0" />
              ) : notice?.tone === "done" ? (
                <CheckCircle2 className="w-[18px] h-[18px] shrink-0" />
              ) : (
                <Info className="w-[18px] h-[18px] shrink-0 text-primary-dark" />
              )}
              <span>{result.status === "error" ? result.message : notice?.message}</span>
            </div>
          )}

          <div className="relative flex-1 min-h-[180px] rounded-lg border border-border bg-[#e4e7f5] overflow-hidden">
            <CameraCapture ref={cameraRef} onReadyChange={setCameraReady} />
            <div className="absolute left-3.5 bottom-3.5 flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-2.5 py-1 text-xs text-muted-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${cameraReady ? "bg-[#3f9c5a]" : "bg-muted"}`}
              />
              {cameraReady ? "Camera ready" : "Preparing camera…"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {geofenceStatus ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  className={`w-4 h-4 ${geofenceStatus.withinRadius ? "text-primary" : "text-red-600"}`}
                />
                {Math.round(geofenceStatus.distanceMeters)}m from the office
                {geofenceStatus.withinRadius ? " — within range" : " — outside allowed range"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-primary" />
                Location is checked when you check in
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Lock className="w-[15px] h-[15px]" />
              Never share your PIN
            </span>
          </div>
        </div>

        {/* Right pane */}
        <div className="border-t lg:border-t-0 lg:border-l border-border bg-surface-2 flex flex-col p-5 sm:p-6 gap-4">
          <div>
            <label className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
              Employee ID
            </label>
            <div className="relative mt-0.5">
              <input
                value={employeeCode}
                onChange={(e) => {
                  setEmployeeCode(e.target.value.toUpperCase());
                  // A new employee code means a possibly different person at
                  // the kiosk — don't carry over whatever the last person
                  // picked for "Where are you today?".
                  setWfhCheckInMode("HOME");
                }}
                placeholder="EMP001"
                autoCapitalize="characters"
                autoFocus
                className="w-full bg-transparent text-[26px] sm:text-[30px] font-medium tracking-[-0.01em] text-foreground focus:outline-none placeholder:text-muted/60"
              />
              {statusLoading && (
                <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted animate-spin" />
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
              PIN
            </label>
            <div className="flex gap-2 mt-2">
              {Array.from({ length: PIN_SLOTS }, (_, i) => (
                <span
                  key={i}
                  className={`flex-1 h-[46px] rounded-lg border flex items-center justify-center text-[22px] ${
                    i < pin.length ? "border-primary text-foreground" : "border-border"
                  }`}
                >
                  {i < pin.length ? "•" : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-3 gap-2">
            {KEYPAD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                disabled={busy}
                className={
                  key === "clear"
                    ? "rounded-lg border border-border text-[13px] text-muted hover:bg-black/[0.03] transition-colors disabled:opacity-50"
                    : key === "back"
                      ? "rounded-lg border border-border text-muted flex items-center justify-center hover:bg-black/[0.03] transition-colors disabled:opacity-50"
                      : "rounded-lg border border-border bg-surface text-2xl font-medium text-foreground hover:bg-black/[0.03] transition-colors disabled:opacity-50"
                }
              >
                {key === "clear" ? "Clear" : key === "back" ? <Delete className="w-5 h-5" /> : key}
              </button>
            ))}
          </div>

          {empStatus?.workMode === "WFH" && notYetCheckedIn && (
            <div>
              <label className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
                Where are you today?
              </label>
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => setWfhCheckInMode("HOME")}
                  disabled={busy}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    wfhCheckInMode === "HOME"
                      ? "border-primary bg-primary/[0.08] text-primary-dark"
                      : "border-border text-muted hover:bg-black/[0.03]"
                  }`}
                >
                  <Home className="w-4 h-4" />
                  Home
                </button>
                <button
                  type="button"
                  onClick={() => setWfhCheckInMode("OFFICE")}
                  disabled={busy}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    wfhCheckInMode === "OFFICE"
                      ? "border-primary bg-primary/[0.08] text-primary-dark"
                      : "border-border text-muted hover:bg-black/[0.03]"
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  Office
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleAction("CHECK_OUT")}
              disabled={busy || !formReady || !canCheckOut}
              className="flex items-center gap-2.5 rounded-lg border border-primary bg-primary/[0.08] text-primary-dark py-3.5 px-4 text-base font-medium hover:bg-primary/[0.14] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary/[0.08]"
            >
              <LogOut className="w-[19px] h-[19px]" />
              {busy ? "Processing…" : "Check out"}
            </button>
            <button
              type="button"
              onClick={() => handleAction("CHECK_IN")}
              disabled={busy || !formReady || !canCheckIn}
              className="flex items-center gap-2.5 rounded-lg border border-border text-muted py-3.5 px-4 text-base font-medium hover:bg-black/[0.03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogIn className="w-[19px] h-[19px]" />
              {busy ? "Processing…" : "Check in"}
            </button>
          </div>
        </div>
      </div>

      {trackingPopupId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-surface-2 rounded-lg border border-border p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="w-7 h-7" />
            </div>
            <p className="text-foreground">
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
              className="w-full rounded-lg border border-primary text-primary-dark py-3 font-medium hover:bg-primary/5 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
