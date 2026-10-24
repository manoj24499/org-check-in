import { haversineDistanceMeters } from "@/lib/geofence";

// The geofence auto-pause rules, shared by the live evaluator (/api/kiosk/location's evaluatePauseState)
// and the catch-up that re-works a session after a phone uploads readings it saved while offline.

// A ping streak only counts as "consecutive" if readings are this close together: otherwise irregular or
// throttled background delivery (the app was backgrounded, the OS throttled it, a brief connectivity gap)
// could be mistaken for a genuine run of readings.
export const MAX_STREAK_GAP_MS = 5 * 60 * 1000;
export const GRACE_PERIOD_MS = 10 * 60 * 1000;
export const STREAK_LENGTH = 3;

export interface Reading {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface ReplayedPause {
  start: Date;
  /** Null when still outside at the last reading. */
  end: Date | null;
}

/**
 * Replays a session's location readings, oldest first, through the same state machine the live evaluator
 * runs on each ping, and returns the pauses it would have produced:
 *  - 3 readings in a row outside the area (each at most 5 minutes apart) starts a 10-minute warning;
 *  - still outside when the warning has run 10 minutes: paused, counted from when the warning started;
 *  - 3 readings in a row back inside ends the pause.
 * Pure: no database access, so it is easy to reason about and test.
 */
export function computePauseIntervals(
  readings: Reading[],
  target: { latitude: number; longitude: number; radiusMeters: number },
): ReplayedPause[] {
  const sorted = [...readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const inside = sorted.map(
    (r) => haversineDistanceMeters(r.latitude, r.longitude, target.latitude, target.longitude) <= target.radiusMeters,
  );

  const intervals: ReplayedPause[] = [];
  let warningAt: Date | null = null;
  let pausedFrom: Date | null = null;

  for (let i = 0; i < sorted.length; i++) {
    // Confirmed = this reading and the ones just before it agree, with no wide gap between them.
    let streak = 1;
    for (let k = i; k > 0 && streak < STREAK_LENGTH; k--) {
      const gap = sorted[k].timestamp.getTime() - sorted[k - 1].timestamp.getTime();
      if (gap > MAX_STREAK_GAP_MS || inside[k - 1] !== inside[i]) break;
      streak++;
    }
    const confirmed = streak >= STREAK_LENGTH;
    const t = sorted[i].timestamp;

    if (pausedFrom) {
      if (inside[i] && confirmed) {
        intervals.push({ start: pausedFrom, end: t });
        pausedFrom = null;
      }
      continue;
    }
    if (inside[i]) {
      warningAt = null;
      continue;
    }
    if (!warningAt) {
      if (confirmed) warningAt = t;
      continue;
    }
    if (t.getTime() - warningAt.getTime() >= GRACE_PERIOD_MS) {
      pausedFrom = warningAt;
      warningAt = null;
    }
  }

  if (pausedFrom) intervals.push({ start: pausedFrom, end: null });
  return intervals;
}
