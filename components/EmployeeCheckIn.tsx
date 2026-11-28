"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Building2, Home, Info, Loader2, LogIn, LogOut, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import CameraCapture, { type CameraCaptureHandle } from "./CameraCapture";
import { isTrackingActive, resumeTrackingIfActive, startTracking, stopTracking } from "@/lib/locationTracker";
import { haversineDistanceMeters } from "@/lib/geofence";

// Leaflet needs the browser, so the map loads on the client only.
const LiveMap = dynamic(() => import("./mypage/LiveMap"), {
  ssr: false,
  loading: () => <div style={{ position: "absolute", inset: 0, background: "var(--mp-muted)" }} />,
});

const FACE: React.CSSProperties = {
  position: "absolute", inset: 0, overflow: "hidden", borderRadius: 12, border: "1px solid var(--mp-border)", background: "var(--mp-muted)",
  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
};

type WorkMode = "OFFICE" | "WFH" | "FIELD" | "HYBRID";

type Status = {
  exists: boolean;
  workMode?: WorkMode;
  checkedIn: boolean;
  checkedOut: boolean;
  checkInAt?: string | null;
  checkOutPhotoRequired?: boolean;
  pauses?: { pausedAt: string; resumedAt: string | null }[];
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  canResume?: boolean;
  resumeUsed?: boolean;
  // The open work segment (FIELD and HYBRID only). For FIELD the server switches it between FIELD and OFFICE
  // from the location pings this tab sends while checked in (3 readings in a row inside / outside the office).
  segment?: { mode: string | null; startedAt: string | null } | null;
};

type Office = { name: string; latitude: number; longitude: number; radiusMeters: number } | null;
type Action = "CHECK_IN" | "CHECK_OUT" | "RESUME";
type Notice = { tone: "error" | "done"; message: string; retry?: Action };

const IST_MS = 5.5 * 3600_000;
const DAY_MS = 24 * 3600_000;
/** Minutes since midnight in IST (the page shows IST times everywhere). */
const istMinutes = (ms: number) => Math.floor((((ms + IST_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);

function readPosition(highAccuracy: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: highAccuracy, timeout: 10_000, maximumAge: 0 });
  });
}

// A laptop has no GPS, so the precise attempt often times out: settle for a rougher fix unless permission was refused.
async function getPosition(): Promise<GeolocationPosition> {
  try {
    return await readPosition(true);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as GeolocationPositionError).code === 1) throw err;
    return readPosition(false);
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};
const hhmmToMinutes = (v?: string | null) => {
  const m = v?.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clockLabel = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * The "today" card of My Page: live worked time, the day as a timeline, and check in / check out. The employee
 * proved who they are with their ID and PIN when they signed in, so only the face photo and the location are
 * checked here, by the same server rules as the kiosk and the phone app. Location tracking runs from this tab
 * after a check-in.
 */
export default function EmployeeCheckIn({ employeeCode, firstName, requests, footer }: { employeeCode: string; firstName: string; requests?: React.ReactNode; footer?: React.ReactNode }) {
  const router = useRouter();
  const cameraRef = useRef<CameraCaptureHandle>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [office, setOffice] = useState<Office>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [today, setToday] = useState<"HOME" | "OFFICE">("HOME");
  const [tracking, setTracking] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [distance, setDistance] = useState<{ meters: number; within: boolean } | null>(null);
  // The card flips from the live map to the camera when a photo is needed.
  const [flipped, setFlipped] = useState(false);
  // The photo the person took with the shutter button (a data URL); sent when they confirm.
  const [shot, setShot] = useState<string | null>(null);
  // Field workers, before check-in: Office / Field is picked from where they are, until they tap the toggle.
  const [autoPlace, setAutoPlace] = useState(true);
  const [atOffice, setAtOffice] = useState<boolean | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/status?employeeCode=${encodeURIComponent(employeeCode)}`, { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // The buttons still work; the server decides on every press.
    }
  }, [employeeCode]);

  useEffect(() => {
    const t = setTimeout(() => void loadStatus(), 0);
    return () => clearTimeout(t);
  }, [loadStatus]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kiosk/office-location")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setOffice(d.officeLocation ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const kick = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(kick);
      clearInterval(id);
    };
  }, []);

  const isWorking = Boolean(status?.checkedIn && !status.checkedOut);
  const isDone = Boolean(status?.checkedIn && status.checkedOut);
  const workMode = status?.workMode;
  const canPickPlace = (workMode === "WFH" || workMode === "FIELD") && !status?.checkedIn;
  const needPhotoToCheckOut = Boolean(status?.checkOutPhotoRequired);
  // Checked out earlier today and allowed to reopen the day once ("Resume work").
  const canResume = Boolean(isDone && status?.canResume);
  const showDone = isDone && !canResume;
  // The office is drawn on the map for people who are checked against it, and always for field workers (so they
  // can see when they reach it).
  const mapOffice = office && (workMode === "OFFICE" || workMode === "HYBRID" || workMode === "FIELD" || (canPickPlace && today === "OFFICE")) ? office : null;
  // Field worker, checked in: where the server has them right now.
  const fieldNow = workMode === "FIELD" && isWorking ? (status?.segment?.mode === "OFFICE" ? "OFFICE" : "FIELD") : null;

  // Field worker, not checked in yet: watch the location and pick Office inside the office area, Field outside it.
  // Stops once they choose by hand.
  const autoPick = workMode === "FIELD" && canPickPlace && Boolean(office);
  useEffect(() => {
    if (!autoPick || !office || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const meters = haversineDistanceMeters(p.coords.latitude, p.coords.longitude, office.latitude, office.longitude);
        setAtOffice(meters <= office.radiusMeters);
      },
      () => setAtOffice(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [autoPick, office]);
  useEffect(() => {
    if (!autoPick || !autoPlace || atOffice === null) return;
    const t = setTimeout(() => setToday(atOffice ? "OFFICE" : "HOME"), 0);
    return () => clearTimeout(t);
  }, [autoPick, autoPlace, atOffice]);

  // Field worker, checked in: refresh the status every 30 s so the Office / Field label follows the server's switch.
  useEffect(() => {
    if (workMode !== "FIELD" || !isWorking) return;
    const id = setInterval(() => void loadStatus(), 30_000);
    return () => clearInterval(id);
  }, [workMode, isWorking, loadStatus]);

  // The first press turns the card to the camera; the next press takes the photo and sends it.
  function press(action: Action) {
    const photoNeeded = action !== "CHECK_OUT" || needPhotoToCheckOut;
    if (photoNeeded && !flipped) {
      setNotice(null);
      setDistance(null);
      setFlipped(true);
      return;
    }
    void run(action);
  }
  function backToMap() {
    setFlipped(false);
    setCameraReady(false);
    setShot(null);
  }
  function takeShot() {
    const url = cameraRef.current?.capture();
    if (url) {
      setNotice(null);
      setShot(url);
    } else {
      fail("The camera isn't ready. Allow camera access in the browser, then try again.");
    }
  }

  // While checked in, keep the screen awake: a phone that locks suspends the browser tab and location stops, so
  // this is the one thing the page can do to cut the gaps (supported on current iPhone Safari and Chrome). The
  // lock is released by the browser whenever the tab is hidden, so it is asked for again when the tab returns.
  useEffect(() => {
    if (!isWorking) return;
    // A tab reopened after a refresh picks its saved session up again.
    resumeTrackingIfActive();
    const t = setTimeout(() => setTracking(isTrackingActive()), 0);
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const ask = async () => {
      try {
        if (stopped || document.visibilityState !== "visible" || !navigator.wakeLock) return;
        lock = await navigator.wakeLock.request("screen");
      } catch {
        // Refused (battery saver, unsupported): tracking still runs while the screen is on.
      }
    };
    void ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      stopped = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => {});
    };
  }, [isWorking]);

  function fail(message: string, retry?: Action) {
    setNotice({ tone: "error", message, retry });
  }

  async function run(action: Action) {
    if (busy) return;
    setNotice(null);
    setDistance(null);
    // The photo already taken with the shutter button, else (a check-out that needs none) nothing to send.
    const photo = shot ?? cameraRef.current?.capture() ?? undefined;
    if ((action === "CHECK_IN" || action === "RESUME" || needPhotoToCheckOut) && !photo) {
      fail("The camera isn't ready. Allow camera access in the browser, then try again.", action);
      return;
    }
    setBusy(true);
    let coords: { latitude: number; longitude: number; accuracy: number } | undefined;
    try {
      const p = await getPosition();
      coords = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
    } catch (err) {
      const denied = typeof err === "object" && err !== null && "code" in err && (err as GeolocationPositionError).code === 1;
      setBusy(false);
      fail(
        denied
          ? "Location permission is required. Allow location for this site in the browser, then try again."
          : "Unable to get your location. Turn on location services, then try again.",
        action,
      );
      return;
    }
    const againstOffice = workMode === "OFFICE" || workMode === "HYBRID" || (canPickPlace && today === "OFFICE");
    if (office && againstOffice) {
      const meters = haversineDistanceMeters(coords.latitude, coords.longitude, office.latitude, office.longitude);
      setDistance({ meters, within: meters <= office.radiusMeters });
    }
    try {
      const res = await fetch("/api/kiosk/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "session",
          employeeCode,
          action,
          photo,
          ...coords,
          checkInMode: action === "CHECK_IN" && canPickPlace && today === "OFFICE" ? "OFFICE" : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string; trackingToken?: string };
      if (!res.ok || !data.id) {
        fail(data.error ?? `Something went wrong (error ${res.status}). Please try again.`, action);
        return;
      }
      if (action === "RESUME") {
        startTracking(data.id, data.trackingToken);
        setTracking(true);
        setNotice({
          tone: "done",
          message:
            "Welcome back. The time since you checked out is recorded as a break. Location tracking has started again: keep this tab open, the screen awake and location on.",
        });
      } else if (action === "CHECK_IN") {
        startTracking(data.id, data.trackingToken);
        setTracking(true);
        setNotice({
          tone: "done",
          message:
            "You're checked in. Live location tracking has started: keep this tab open, keep the screen awake and keep location on during your working hours. Closing the tab, or your phone locking it, stops tracking.",
        });
      } else {
        stopTracking();
        setTracking(false);
        setNotice({ tone: "done", message: "You're checked out. See you tomorrow!" });
      }
      backToMap();
      await loadStatus();
      router.refresh();
    } catch {
      fail("Network error. Please try again.", action);
    } finally {
      setBusy(false);
    }
  }

  // ---- today's numbers ----
  const checkInMs = status?.checkInAt ? new Date(status.checkInAt).getTime() : null;
  const pauseMs =
    now && checkInMs
      ? (status?.pauses ?? []).reduce((sum, p) => {
          const from = new Date(p.pausedAt).getTime();
          const to = p.resumedAt ? new Date(p.resumedAt).getTime() : now;
          return sum + Math.max(0, to - from);
        }, 0)
      : 0;
  const workedMs = isWorking && now && checkInMs ? Math.max(0, now - checkInMs - pauseMs) : 0;
  const shiftStart = hhmmToMinutes(status?.shiftStartTime);
  const shiftEnd = hhmmToMinutes(status?.shiftEndTime);
  const targetHours = shiftStart !== null && shiftEnd !== null && shiftEnd > shiftStart ? (shiftEnd - shiftStart) / 60 : 8;
  const pct = Math.min(100, Math.round((workedMs / (targetHours * 3600_000)) * 100));

  // timeline window in IST minutes
  const checkInMin = checkInMs ? istMinutes(checkInMs) : null;
  const winStart = Math.floor(Math.min(540, checkInMin ?? 540, shiftStart ?? 540) / 60) * 60;
  const winEnd = Math.max(1140, Math.ceil(((shiftEnd ?? 1080) + 30) / 60) * 60);
  const span = Math.max(60, winEnd - winStart);
  const toPct = (min: number) => Math.min(100, Math.max(0, ((min - winStart) / span) * 100));
  const nowMin = now ? istMinutes(now) : null;
  const ticks: number[] = [];
  for (let m = winStart; m <= winEnd; m += Math.ceil(span / 4 / 60) * 60) ticks.push(m);

  const statusLine = isWorking
    ? `Live · checked in ${new Date(status!.checkInAt!).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })}`
    : isDone
      ? "Done for today"
      : "Not checked in yet";

  return (
    <section
      id="today"
      className="rise"
      aria-label="Today"
      style={{ animationDelay: ".1s", display: "flex", flexWrap: "wrap", background: "var(--mp-surface)", border: "1px solid var(--mp-border)", borderRadius: 16, overflow: "hidden" }}
    >
      <div style={{ flex: "1 1 460px", minWidth: 0, padding: 32, display: "flex", flexDirection: "column", gap: 28, background: "linear-gradient(180deg, rgba(239,108,0,0.05), transparent 60%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            className={isWorking ? "live" : undefined}
            style={{ width: 10, height: 10, borderRadius: 999, background: isWorking ? "var(--mp-primary)" : "var(--mp-text3)" }}
          />
          <span className="label" style={{ color: isWorking ? "var(--mp-primary-dark)" : "var(--mp-text2)" }}>
            {statusLine}
          </span>
          {tracking && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 999, background: "var(--mp-success-muted)", color: "var(--mp-success)", fontSize: 12, fontWeight: 600 }}>
              <MapPin size={12} /> Tracking on
            </span>
          )}
        </div>

        <div>
          <div style={{ fontSize: "clamp(48px, 8vw, 72px)", lineHeight: 1.05, fontWeight: 700, letterSpacing: "-0.045em", fontVariantNumeric: "tabular-nums" }}>
            {isWorking ? hms(workedMs) : "00:00:00"}
          </div>
          <div className="sub" style={{ marginTop: 8, fontSize: 15 }}>
            worked today · <strong style={{ color: "var(--mp-text)", fontWeight: 600 }}>{isWorking ? `${pct}%` : "–"}</strong> of a {Math.round(targetHours * 10) / 10}h shift
            {" · "}time outside your area is excluded
          </div>
          {requests && <div style={{ marginTop: 20 }}>{requests}</div>}
        </div>

        <div>
          <div style={{ position: "relative", height: 36 }} aria-hidden="true">
            <div style={{ position: "absolute", top: 12, left: 0, right: 0, height: 12, borderRadius: 999, background: "var(--mp-muted)" }} />
            {isWorking && checkInMin !== null && nowMin !== null && (
              <>
                <div className="seg" style={{ position: "absolute", top: 12, left: `${toPct(checkInMin)}%`, width: `${Math.max(0, toPct(nowMin) - toPct(checkInMin))}%`, height: 12, borderRadius: 999, background: "var(--mp-primary)" }} />
                {(status?.pauses ?? []).map((p, i) => {
                  const a = istMinutes(new Date(p.pausedAt).getTime());
                  const b = p.resumedAt ? istMinutes(new Date(p.resumedAt).getTime()) : nowMin;
                  return (
                    <div key={i} style={{ position: "absolute", top: 12, left: `${toPct(a)}%`, width: `${Math.max(0.8, toPct(b) - toPct(a))}%`, height: 12, borderRadius: 999, background: "#cfc5bd" }} />
                  );
                })}
                <div style={{ position: "absolute", top: 4, left: `${toPct(nowMin)}%`, width: 2, height: 28, background: "var(--mp-text)", borderRadius: 2 }} />
              </>
            )}
            {shiftEnd !== null && <div style={{ position: "absolute", top: 8, left: `${toPct(shiftEnd)}%`, width: 0, height: 20, borderLeft: "1px dashed var(--mp-text3)" }} />}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--mp-text2)", fontVariantNumeric: "tabular-nums" }}>
            {ticks.map((m) => (
              <span key={m}>{clockLabel(m)}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 13 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--mp-primary)" }} />
              Working
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: "#cfc5bd" }} />
              Auto-paused
            </span>
            {shiftEnd !== null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, border: "1px dashed var(--mp-text3)" }} />
                Shift ends
              </span>
            )}
          </div>
        </div>
        {footer}
      </div>

      <div style={{ flex: "1 1 340px", minWidth: 0, padding: 24, margin: 16, borderRadius: 12, background: "var(--mp-bg)", border: "1px solid var(--mp-border)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="label">{flipped ? (shot ? "Review your photo" : "Take your photo") : canResume ? "Check in again" : isDone ? "Day summary" : isWorking ? (needPhotoToCheckOut ? "Check out" : "Live") : "Check in"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--mp-text2)" }}>
            <ShieldCheck size={14} /> Face and location verified
          </span>
        </div>

        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 8, fontSize: 14,
              background: notice.tone === "error" ? "var(--mp-danger-muted)" : "var(--mp-success-muted)",
              color: notice.tone === "error" ? "var(--mp-danger)" : "var(--mp-success)",
            }}
          >
            <Info size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ flex: 1 }}>{notice.message}</span>
            {notice.retry && (
              <button type="button" onClick={() => void run(notice.retry!)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid currentColor", borderRadius: 8, padding: "2px 10px", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <RefreshCw size={13} /> Try again
              </button>
            )}
          </div>
        )}

        <div style={{ perspective: 1200 }}>
          <div
            style={{
              position: "relative", aspectRatio: "4 / 3", transformStyle: "preserve-3d",
              transition: "transform .7s cubic-bezier(.4,.2,.2,1)", transform: flipped ? "rotateY(180deg)" : "none",
            }}
          >
            <div style={{ ...FACE, visibility: flipped ? "hidden" : "visible", transition: "visibility 0s linear .35s" }}>
              {showDone ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, textAlign: "center" }}>
                  <svg width="64" height="64" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="32" fill="none" stroke="#2e6f52" strokeWidth="3" /><path d="M22 37 L32 47 L51 26" fill="none" stroke="#2e6f52" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ fontWeight: 600 }}>Good work today, {firstName}</span>
                  <span className="sub">You&apos;ve completed today&apos;s attendance.</span>
                </div>
              ) : (
                <LiveMap office={mapOffice} active={!flipped} />
              )}
            </div>
            <div style={{ ...FACE, transform: "rotateY(180deg)", visibility: flipped ? "visible" : "hidden", transition: "visibility 0s linear .35s" }}>
              {flipped && <CameraCapture ref={cameraRef} onReadyChange={setCameraReady} />}
              {shot && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot} alt="Your photo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              )}
              {!shot && (
                <div style={{ position: "absolute", left: 10, top: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.92)", border: "1px solid var(--mp-border)", fontSize: 12 }}>
                  <span className={cameraReady ? undefined : "live"} style={{ width: 6, height: 6, borderRadius: 999, background: cameraReady ? "var(--mp-success)" : "var(--mp-text3)" }} />
                  {cameraReady ? "Camera ready" : "Preparing camera…"}
                </div>
              )}
              {flipped && !shot && (
                <button
                  type="button"
                  aria-label="Take photo"
                  onClick={takeShot}
                  disabled={!cameraReady || busy}
                  style={{
                    position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", width: 64, height: 64, borderRadius: 999,
                    background: "rgba(255,255,255,0.25)", border: "4px solid #fff", padding: 0, cursor: cameraReady ? "pointer" : "not-allowed",
                    display: "grid", placeItems: "center", opacity: cameraReady ? 1 : 0.5, boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                  }}
                >
                  <span style={{ width: 44, height: 44, borderRadius: 999, background: "#fff" }} />
                </button>
              )}
              {shot && (
                <button
                  type="button"
                  onClick={() => setShot(null)}
                  disabled={busy}
                  style={{
                    position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.95)", border: "1px solid var(--mp-border)",
                    fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--mp-text)",
                  }}
                >
                  <RefreshCw size={14} /> Retake
                </button>
              )}
            </div>
          </div>
        </div>

        {canPickPlace && (
          <div role="group" aria-label="Working from" className="toggle">
            {(["HOME", "OFFICE"] as const).map((v) => (
              <button key={v} type="button" disabled={busy} className={today === v ? "on" : ""} onClick={() => { setAutoPlace(false); setToday(v); }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {v === "OFFICE" ? <Building2 size={16} /> : workMode === "FIELD" ? <MapPin size={16} /> : <Home size={16} />}
                  {v === "OFFICE" ? "Office" : workMode === "FIELD" ? "Field" : "Home"}
                </span>
              </button>
            ))}
          </div>
        )}
        {autoPick && (
          <p className="sub" style={{ margin: 0, fontSize: 13 }}>
            {!autoPlace
              ? "You picked this yourself."
              : atOffice === null
                ? "Finding your location to pick Office or Field…"
                : atOffice
                  ? "You're at the office, so Office is picked."
                  : "You're away from the office, so Field is picked."}
          </p>
        )}

        {fieldNow && (
          <div
            role="status"
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: fieldNow === "OFFICE" ? "var(--mp-success-muted)" : "var(--mp-muted)",
              color: fieldNow === "OFFICE" ? "var(--mp-success)" : "var(--mp-text)",
            }}
          >
            {fieldNow === "OFFICE" ? <Building2 size={16} /> : <MapPin size={16} />}
            {fieldNow === "OFFICE" ? "Office mode" : "Field mode"}
            <span className="sub" style={{ fontWeight: 400, fontSize: 12, marginLeft: "auto" }}>switches when you reach or leave the office</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {canResume && !flipped && (
            <p className="sub" style={{ margin: 0 }}>
              You checked out earlier today. You can check in again: the time away is recorded as a break, and today&apos;s first
              check-in time stays as it was.
            </p>
          )}
          {canResume ? (
            <button type="button" className="btn btn-primary" onClick={() => press("RESUME")} disabled={busy || (flipped && !shot)}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {busy ? "Processing…" : "Check in again"}
              </span>
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => press("CHECK_IN")} disabled={busy || isWorking || isDone || (flipped && !shot)}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {busy ? "Processing…" : "Check in"}
                </span>
              </button>
              <button type="button" className="btn btn-outline" onClick={() => press("CHECK_OUT")} disabled={busy || !isWorking || (flipped && !shot)}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <LogOut size={18} /> Check out
                </span>
              </button>
            </>
          )}
          {flipped && !busy && (
            <button type="button" className="btn" style={{ border: "none", background: "transparent", color: "var(--mp-text2)" }} onClick={backToMap}>
              Back to map
            </button>
          )}
        </div>

        {distance && (
          <p style={{ margin: 0, fontSize: 13, color: distance.within ? "var(--mp-success)" : "var(--mp-danger)" }}>
            {Math.round(distance.meters)} m from the office{distance.within ? " — within range" : " — outside allowed range"}
          </p>
        )}
      </div>
    </section>
  );
}
