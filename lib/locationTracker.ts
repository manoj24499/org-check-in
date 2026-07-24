// Module-level (not React-state) tracking loop. It intentionally lives
// outside any component so it survives client-side route changes within the
// kiosk tab (e.g. navigating from /kiosk to /kiosk/status/[id] and back) —
// a component-scoped interval would otherwise die on unmount and silently
// stop tracking well before the employee's shift ends.
//
// `sessionStorage` persists the active session across an accidental hard
// refresh, and — just as importantly — clears itself when the tab closes,
// which is exactly the "closing this tab stops tracking" behavior required.

const STORAGE_KEY = "kiosk_tracking_attendance_id";
const PING_INTERVAL_MS = 5 * 60 * 1000;
// Debounces the "immediate ping" triggers below — a laptop waking from sleep
// or a quick alt-tab both fire visibilitychange, but we don't want to hammer
// the geolocation API/network if that happens repeatedly in a short span.
const MIN_IMMEDIATE_PING_GAP_MS = 30 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let currentAttendanceId: string | null = null;
let lastPingAttemptAt = 0;

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    });
  });
}

async function sendPing(attendanceId: string) {
  lastPingAttemptAt = Date.now();
  try {
    const position = await getPosition();
    const res = await fetch("/api/kiosk/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.tracking === false) {
      stopTracking();
    }
  } catch {
    // A single failed ping (GPS momentarily unavailable, offline, etc.)
    // shouldn't end the session — it simply retries on the next tick.
  }
}

function scheduleInterval(attendanceId: string) {
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => sendPing(attendanceId), PING_INTERVAL_MS);
}

/** Call right after a successful Check-In. */
export function startTracking(attendanceId: string) {
  stopTracking();
  currentAttendanceId = attendanceId;
  sessionStorage.setItem(STORAGE_KEY, attendanceId);
  sendPing(attendanceId);
  scheduleInterval(attendanceId);
}

/** Call right after a successful Check-Out from this same tab. */
export function stopTracking() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  currentAttendanceId = null;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isTrackingActive(): boolean {
  return intervalId !== null;
}

/** Call once on app mount to resume a session that survived a page reload. */
export function resumeTrackingIfActive() {
  if (intervalId) return;
  const attendanceId = sessionStorage.getItem(STORAGE_KEY);
  if (!attendanceId) return;
  currentAttendanceId = attendanceId;
  sendPing(attendanceId);
  scheduleInterval(attendanceId);
}

// A `setInterval` doesn't fire while a laptop is asleep or the tab is deeply
// throttled in the background — after waking, the "next" tick could be
// minutes late. Ping immediately as soon as the tab is visible/focused or
// connectivity returns, then realign the 5-minute schedule to start fresh
// from that moment (rather than leaving it on its old, now-stale phase).
function pingNowIfDue() {
  if (!currentAttendanceId) return;
  if (Date.now() - lastPingAttemptAt < MIN_IMMEDIATE_PING_GAP_MS) return;
  const attendanceId = currentAttendanceId;
  sendPing(attendanceId);
  scheduleInterval(attendanceId);
}

if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pingNowIfDue();
  });
  window.addEventListener("focus", pingNowIfDue);
  window.addEventListener("online", pingNowIfDue);
}
