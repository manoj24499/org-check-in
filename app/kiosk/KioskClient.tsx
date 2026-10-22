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
  Home,
  Building2,
  Eye,
  ScanFace,
  EyeOff,
  IdCard,
  ShieldCheck,
  Timer,
  Clock,
  CalendarOff,
  Flag,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import CameraCapture, { CameraCaptureHandle } from "@/components/CameraCapture";
import { startTracking, stopTracking } from "@/lib/locationTracker";
import { haversineDistanceMeters } from "@/lib/geofence";
import { Logo } from "@/components/Logo";

type Result =
  | { status: "idle" }
  // `retry` adds a "Try again" button to the notice for problems the person
  // can fix on the spot (location/camera), replaying the action they pressed.
  | { status: "error"; message: string; retry?: "CHECK_IN" | "CHECK_OUT" };

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
  /** Present only for someone who hasn't checked in: a check-in right now would be late by this much. */
  lateWarning?: { minutes: number; leaveType: "PERMISSION" | "HALF_DAY" } | null;
  onLeaveToday?: boolean;
  publicHoliday?: string | null;
  /** Face verification is on for this person but the service can't be reached right now. */
  faceCheckUnavailable?: boolean;
};

const PIN_SLOTS = 6;
// Idle time after which a half-filled form (ID/PIN) is wiped, so the next person
// at this shared device never sees the previous employee's ID.
const IDLE_RESET_MS = 30_000;
// How long the camera may stay un-ready before we say so, instead of leaving "Preparing camera…" forever.
const CAMERA_SLOW_MS = 8_000;

const WORK_MODE_LABEL: Record<NonNullable<EmployeeStatus["workMode"]>, string> = {
  OFFICE: "Office",
  WFH: "Work from home",
  FIELD: "Field",
};

// A plain function of its arguments (not a hook/closure) so both call sites
// below — after a CHECK_OUT submit, and after dismissing the post-check-in
// tracking popup — build the exact same URL without needing to keep two
// copies in sync.
function statusUrl(attendanceId: string, orgSlug: string | undefined): string {
  return orgSlug ? `/kiosk/status/${attendanceId}?orgSlug=${encodeURIComponent(orgSlug)}` : `/kiosk/status/${attendanceId}`;
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

type Notice = { tone: "info" | "done" | "warn" | "error"; icon: LucideIcon; message: string; retry?: "CHECK_IN" | "CHECK_OUT" };

const NOTICE_STYLE: Record<Notice["tone"], string> = {
  info: "bg-primary/[0.08] border-primary/25 text-[#8a4a10]",
  done: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warn: "bg-amber-50 border-amber-200 text-amber-800",
  error: "bg-red-50 border-red-200 text-red-700",
};

// Shared by both app/kiosk/page.tsx (org-less, kept for backward
// compatibility with already-bookmarked physical devices — the backend
// treats a missing orgSlug as "default") and app/kiosk/[orgSlug]/page.tsx
// (a kiosk's real, permanent URL — see prisma's Organization.slug comment).
export default function KioskClient({ orgSlug }: { orgSlug?: string }) {
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>({ status: "idle" });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [empStatus, setEmpStatus] = useState<EmployeeStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraSlow, setCameraSlow] = useState(false);
  const [trackingPopupId, setTrackingPopupId] = useState<string | null>(null);
  // Whether this kiosk tab is tracking the check-in just made (decides which notice the confirmation shows).
  const [trackingFromKiosk, setTrackingFromKiosk] = useState(false);
  const [officeLocation, setOfficeLocation] = useState<OfficeLocationInfo>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
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
  const lastActivity = useRef(0);
  const router = useRouter();

  // Fetched once so the distance indicator can be shown as soon as a GPS fix
  // comes in — this is purely informational, the server remains the gate.
  useEffect(() => {
    let cancelled = false;
    const params = orgSlug ? `?${new URLSearchParams({ orgSlug }).toString()}` : "";
    fetch(`/api/kiosk/office-location${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setOfficeLocation(data.officeLocation ?? null);
        setOrganizationName(typeof data.organizationName === "string" ? data.organizationName : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // orgSlug comes from the route and never changes without a full
    // remount, but is listed for correctness rather than suppressed.
  }, [orgSlug]);

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

  // If the camera still isn't ready after a while, say so (blocked permission,
  // no camera) rather than showing "Preparing camera…" forever.
  useEffect(() => {
    if (cameraReady) return;
    const t = setTimeout(() => setCameraSlow(true), CAMERA_SLOW_MS);
    return () => clearTimeout(t);
  }, [cameraReady]);

  function handleCameraReady(ready: boolean) {
    setCameraReady(ready);
    if (ready) setCameraSlow(false);
  }

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
          if (orgSlug) params.set("orgSlug", orgSlug);
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
  }, [employeeCode, kioskCoords, orgSlug]);

  // Wipe a half-filled form after a quiet spell (shared device privacy).
  // Skipped mid-request and while the post-check-in popup is open.
  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
    };
    touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const id = setInterval(() => {
      if (busy || trackingPopupId) return;
      if (Date.now() - lastActivity.current < IDLE_RESET_MS) return;
      setEmployeeCode((c) => (c ? "" : c));
      setPin((p) => (p ? "" : p));
      setEmpStatus(null);
      setWfhCheckInMode("HOME");
      setGeofenceStatus(null);
      setShowPin(false);
    }, 5_000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(id);
    };
  }, [busy, trackingPopupId]);

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
            orgSlug,
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
        let data: { id?: string; error?: string; workMode?: "OFFICE" | "WFH" | "FIELD"; checkInMode?: "OFFICE" | "FIELD" | null } = {};
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
            // The kiosk tab reports the *device's* position, so it only means something
            // for a work-from-home employee on their own laptop at home. Office and Field
            // employees are tracked from their phone instead: a shared kiosk left behind
            // in the office would keep reading "inside" after they walk out, and a second
            // source would fight the phone's readings. (A WFH employee who picked
            // "Office" for the day counts as Office here.)
            const trackedFromKiosk = data.workMode === "WFH" && data.checkInMode !== "OFFICE";
            if (trackedFromKiosk) startTracking(data.id);
            setBusy(false);
            setPin("");
            setTrackingPopupId(data.id);
            setTrackingFromKiosk(trackedFromKiosk);
          } else {
            stopTracking();
            router.push(statusUrl(data.id, orgSlug));
          }
        } else {
          setResult({ status: "error", message: "Unexpected response. Please try again." });
          setBusy(false);
          setPin("");
          setTimeout(() => setResult({ status: "idle" }), 4000);
        }
      } catch {
        setResult({ status: "error", message: "Network error. Please try again.", retry: action });
        setBusy(false);
        setPin("");
        setTimeout(() => setResult({ status: "idle" }), 4000);
      }
    },
    [employeeCode, pin, router, wfhCheckInMode, orgSlug],
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

  // A problem the person can fix on the spot: show a message with a "Try again" button
  // (kept up longer than the usual 4 seconds so it can actually be read and used).
  function showFixable(message: string, retry: "CHECK_IN" | "CHECK_OUT") {
    setResult({ status: "error", message, retry });
    setTimeout(() => setResult({ status: "idle" }), 10_000);
  }

  async function handleAction(action: "CHECK_IN" | "CHECK_OUT") {
    if (busy || !formReady) return;
    setResult({ status: "idle" });
    if (action === "CHECK_OUT") {
      if (!canCheckOut) return;
      if (!checkOutPhotoRequired) {
        submit(action);
        return;
      }
      const photo = cameraRef.current?.capture();
      if (!photo) {
        showFixable(
          cameraSlow
            ? "The camera isn't responding. Allow camera access in the browser, then try again."
            : "Camera isn't ready yet. Please wait a moment and try again.",
          action,
        );
        return;
      }
      submit(action, photo);
      return;
    }
    if (!canCheckIn) return;
    const photo = cameraRef.current?.capture();
    if (!photo) {
      showFixable(
        cameraSlow
          ? "The camera isn't responding. Allow camera access in the browser, then try again."
          : "Camera isn't ready yet. Please wait a moment and try again.",
        action,
      );
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
      showFixable(
        denied
          ? "Location permission is required to check in. Allow location for this site in the browser, then try again."
          : "Unable to get your location. Turn on location services, then try again.",
        action,
      );
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

  function handlePinKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Enter does whichever action is currently open for this person.
    if (canCheckOut && !canCheckIn) void handleAction("CHECK_OUT");
    else void handleAction("CHECK_IN");
  }

  const firstName = empStatus?.name?.split(" ")[0];
  const isWorking = Boolean(empStatus?.exists && empStatus.checkedIn && !empStatus.checkedOut);
  const isDone = Boolean(empStatus?.exists && empStatus.checkedIn && empStatus.checkedOut);

  // Hours worked so far — plain elapsed time since check-in (the kiosk lookup doesn't
  // carry pause data, so this isn't reduced by time spent outside the area).
  const sinceCheckIn =
    isWorking && empStatus?.checkInAt && currentTime
      ? formatElapsed(currentTime.getTime() - new Date(empStatus.checkInAt).getTime())
      : null;

  const notices: Notice[] = [];
  if (result.status === "error") {
    notices.push({ tone: "error", icon: Info, message: result.message, retry: result.retry });
  }
  if (isWorking) {
    notices.push({
      tone: "info",
      icon: Info,
      message: `Hi ${firstName ?? "there"} — checked in since ${
        empStatus?.checkInAt
          ? new Date(empStatus.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "earlier"
      }. Don't forget to check out.`,
    });
  } else if (isDone) {
    notices.push({
      tone: "done",
      icon: CheckCircle2,
      message: `${firstName ?? "You've"} completed today's attendance. See you tomorrow!`,
    });
  }
  if (empStatus?.exists && empStatus.publicHoliday) {
    notices.push({ tone: "info", icon: Flag, message: `Today is a public holiday: ${empStatus.publicHoliday}.` });
  }
  if (empStatus?.exists && empStatus.onLeaveToday) {
    notices.push({ tone: "info", icon: CalendarOff, message: "You're on approved leave today." });
  }
  if (empStatus?.exists && empStatus.faceCheckUnavailable) {
    notices.push({
      tone: "warn",
      icon: ScanFace,
      message: "Face check is unavailable right now. You can still check in, but it will be flagged for your admin.",
    });
  }
  if (empStatus?.exists && notYetCheckedIn && empStatus.lateWarning) {
    notices.push({
      tone: "warn",
      icon: Clock,
      message: `You're ${empStatus.lateWarning.minutes} min late. This check-in will be marked as ${
        empStatus.lateWarning.leaveType === "PERMISSION" ? "Permission" : "Half-day leave"
      }.`,
    });
  }

  // "9:02" + "AM", split via Intl so non-English locales (a.m./pm, 24-hour) still render sensibly.
  const clockParts = (() => {
    if (!currentTime) return { time: "", period: "" };
    const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).formatToParts(currentTime);
    const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
    const time = parts
      .filter((p) => p.type !== "dayPeriod")
      .map((p) => p.value)
      .join("")
      .trim();
    return { time, period: period.toUpperCase() };
  })();

  const cameraLabel = cameraReady ? "Camera ready" : cameraSlow ? "Camera isn't responding" : "Preparing camera…";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="lp-rise grid w-full max-w-[1024px] grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_60px_-34px_rgba(41,43,49,0.4)] lg:grid-cols-[1fr_340px]">
        {/* Left pane */}
        <div className="flex flex-col gap-4 p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <Logo variant="static" size={18} className="text-foreground" />
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Kiosk</span>
            {organizationName && (
              <span className="truncate rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-medium text-muted-2">
                {organizationName}
              </span>
            )}
            <Link
              href="/"
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-[15px] w-[15px]" />
              Back to start
            </Link>
          </div>

          <div>
            {currentTime ? (
              <>
                <div className="flex items-baseline gap-1.5 text-[48px] font-medium leading-none tracking-[-0.03em] tabular-nums text-foreground sm:text-[56px]">
                  {clockParts.time}
                  {clockParts.period && <span className="text-[18px] font-normal tracking-normal text-muted">{clockParts.period}</span>}
                </div>
                <div className="mt-1 text-sm text-muted">
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

          {notices.length > 0 && (
            <div className="flex flex-col gap-2">
              {notices.map((n, i) => {
                const Icon = n.icon;
                return (
                  <div
                    key={`${n.tone}-${i}`}
                    role={n.tone === "error" ? "alert" : undefined}
                    className={`lp-rise flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${NOTICE_STYLE[n.tone]}`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1">{n.message}</span>
                    {n.retry && (
                      <button
                        type="button"
                        onClick={() => void handleAction(n.retry!)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/60"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Try again
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-2xl border border-border bg-[#e4e7f5]">
            <CameraCapture ref={cameraRef} onReadyChange={handleCameraReady} />
            {/* Face frame: corner brackets + a slow scan line while the camera is live */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="relative h-[62%] max-h-[220px] w-[34%] min-w-[110px] max-w-[170px]">
                {(["left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl", "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl", "left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-xl", "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-xl"] as const).map((c) => (
                  <i
                    key={c}
                    className={`absolute h-7 w-7 transition-colors duration-300 ${c} ${busy ? "border-emerald-500" : "border-primary"}`}
                  />
                ))}
              </div>
              {cameraReady && <div className="lp-scan absolute left-[8%] right-[8%] h-0.5 bg-primary/60" />}
            </div>
            <div className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${cameraReady ? "bg-[#3f9c5a]" : cameraSlow ? "bg-red-500" : "animate-pulse bg-muted"}`}
              />
              {cameraLabel}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {geofenceStatus ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  className={`h-4 w-4 ${geofenceStatus.withinRadius ? "text-primary" : "text-red-600"}`}
                />
                {Math.round(geofenceStatus.distanceMeters)}m from the office
                {geofenceStatus.withinRadius ? " — within range" : " — outside allowed range"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" />
                Location is checked when you check in
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <Lock className="h-[15px] w-[15px]" />
              Never share your PIN
            </span>
          </div>
        </div>

        {/* Right pane */}
        <div className="flex flex-col justify-center gap-5 border-t border-border bg-surface-2 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div>
            <label htmlFor="kiosk-employee-id" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Employee ID
            </label>
            <div className="relative mt-1.5">
              <IdCard className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input
                id="kiosk-employee-id"
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
                autoComplete="off"
                autoFocus
                className="h-[50px] w-full rounded-xl border border-border bg-surface pl-11 pr-10 text-[20px] font-medium tracking-wide text-foreground transition-shadow placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {statusLoading && (
                <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
              )}
            </div>
          </div>

          {/* Greeting + today's status, once the ID is recognised */}
          {empStatus?.exists && (
            <div className="lp-rise flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-[15px] font-semibold text-primary-dark">
                {(firstName ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[15px] font-medium text-foreground">Hi {firstName ?? "there"}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {empStatus.workMode ? WORK_MODE_LABEL[empStatus.workMode] : ""}
                  {isWorking ? " · Working" : isDone ? " · Done for today" : " · Not checked in yet"}
                </p>
              </div>
              {sinceCheckIn && (
                <div className="text-right leading-tight">
                  <p className="inline-flex items-center gap-1 text-[15px] font-semibold tabular-nums text-foreground">
                    <Timer className="h-3.5 w-3.5 text-primary" />
                    {sinceCheckIn}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">since check-in</p>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="kiosk-pin" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              PIN
            </label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input
                id="kiosk-pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pin}
                maxLength={PIN_SLOTS}
                placeholder="••••"
                disabled={busy}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_SLOTS))}
                onKeyDown={handlePinKeyDown}
                className={`h-[50px] w-full rounded-xl border border-border bg-surface pl-11 pr-11 text-[20px] font-medium text-foreground transition-shadow placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${
                  showPin ? "tracking-[0.2em]" : "tracking-[0.35em]"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
              >
                {showPin ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {Array.from({ length: PIN_SLOTS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-200 ${i < pin.length ? "bg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          </div>

          {empStatus?.workMode === "WFH" && notYetCheckedIn && (
            <div>
              <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Where are you today?
              </label>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWfhCheckInMode("HOME")}
                  disabled={busy}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
                    wfhCheckInMode === "HOME"
                      ? "border-primary bg-primary/[0.08] text-primary-dark"
                      : "border-border text-muted hover:bg-black/[0.03]"
                  }`}
                >
                  <Home className="h-4 w-4" />
                  Home
                </button>
                <button
                  type="button"
                  onClick={() => setWfhCheckInMode("OFFICE")}
                  disabled={busy}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
                    wfhCheckInMode === "OFFICE"
                      ? "border-primary bg-primary/[0.08] text-primary-dark"
                      : "border-border text-muted hover:bg-black/[0.03]"
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  Office
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleAction("CHECK_IN")}
              disabled={busy || !formReady || !canCheckIn}
              className="flex h-[50px] items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 text-base font-medium text-white shadow-[0_10px_20px_-10px_rgba(240,100,0,0.8)] transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:bg-primary-dark enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? <Loader2 className="h-[19px] w-[19px] animate-spin" /> : <LogIn className="h-[19px] w-[19px]" />}
              {busy ? "Processing…" : "Check in"}
            </button>
            <button
              type="button"
              onClick={() => handleAction("CHECK_OUT")}
              disabled={busy || !formReady || !canCheckOut}
              className="flex h-[50px] items-center justify-center gap-2.5 rounded-2xl border border-border bg-surface px-4 text-base font-medium text-foreground transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:hover:border-primary/50 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LogOut className="h-[19px] w-[19px]" />
              {busy ? "Processing…" : "Check out"}
            </button>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            Photo and location are verified on every check-in
          </p>
        </div>
      </div>

      {/* Full-screen confirmation after a successful check-in: also where the
          employee acknowledges live location tracking before moving on. */}
      {trackingPopupId && (
        <div className="lp-rise fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
            <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/15" aria-hidden />
            </div>
            <div>
              <h2 className="text-[28px] font-medium tracking-[-0.02em] text-foreground">
                You&apos;re checked in{firstName ? `, ${firstName}` : ""}
              </h2>
              {currentTime && (
                <p className="mt-1 text-sm tabular-nums text-muted">
                  {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4 text-left">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                {trackingFromKiosk
                  ? "Live location tracking has started. Please keep this tab open and keep location services enabled during your working hours. Closing this tab will stop live location tracking."
                  : "Your location is tracked from the Inzivo app on your phone. Keep it signed in with location enabled during your working hours."}
              </p>
            </div>
            <button
              onClick={() => {
                const id = trackingPopupId;
                setTrackingPopupId(null);
                router.push(statusUrl(id, orgSlug));
              }}
              className="h-12 w-full rounded-2xl bg-primary text-base font-medium text-white shadow-[0_10px_20px_-10px_rgba(240,100,0,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-dark active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
