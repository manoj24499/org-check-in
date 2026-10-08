import { haversineDistanceMeters } from "@/lib/geofence";

export interface RawPing {
  latitude: number;
  longitude: number;
  timestamp: Date;
  /** GPS accuracy radius in metres, when known. */
  accuracy?: number;
}

export interface Visit {
  centroidLatitude: number;
  centroidLongitude: number;
  arrivedAt: Date;
  departedAt: Date;
}

const DEFAULT_RADIUS_METERS = 150;
const DEFAULT_MAX_GAP_MS = 15 * 60 * 1000;
const DEFAULT_MIN_DURATION_MS = 5 * 60 * 1000;

// Distance filters. GPS readings jitter by several metres even when standing
// still, so adding up every tiny hop inflates the total; and a stray bad fix
// (a reading kilometres away that snaps back) adds a huge phantom out-and-back.
// A reading is ignored if its own accuracy is poor, it implies an impossible
// speed, or it hasn't moved far enough from the last counted point.
const MAX_ACCURACY_METERS = 100;
const MIN_STEP_METERS = 10;
const MAX_SPEED_MPS = 70; // ~250 km/h
// Regular pings arrive about every 2 minutes, so a silence longer than this means
// the phone stopped reporting (battery saver, signal, app closed). The straight
// line across such a silence is a guess, not a measured path, so it is not
// counted as distance and the map draws it dashed.
export const TRACKING_GAP_SECONDS = 5 * 60;

export interface TrackingGap {
  from: Date;
  to: Date;
  seconds: number;
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  /** Straight-line distance between the two points either side of the gap. */
  straightMeters: number;
}

/** Silences longer than TRACKING_GAP_SECONDS between consecutive readings. */
export function findTrackingGaps(pings: RawPing[]): TrackingGap[] {
  const sorted = [...pings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const gaps: TrackingGap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const seconds = (b.timestamp.getTime() - a.timestamp.getTime()) / 1000;
    if (seconds > TRACKING_GAP_SECONDS) {
      gaps.push({
        from: a.timestamp,
        to: b.timestamp,
        seconds,
        fromLatitude: a.latitude,
        fromLongitude: a.longitude,
        toLatitude: b.latitude,
        toLongitude: b.longitude,
        straightMeters: haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude),
      });
    }
  }
  return gaps;
}

/**
 * Distance travelled along the recorded readings, in metres: the sum of
 * great-circle distances between consecutive *counted* points (see the filters
 * above). Dense readings follow the road closely; sparse ones cut corners and
 * under-count, which is why the mobile app now batches frequent samples.
 */
export function computeTotalDistanceMeters(pings: RawPing[]): number {
  const sorted = [...pings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let total = 0;
  let anchor: RawPing | null = null;
  for (const p of sorted) {
    if (p.accuracy !== undefined && p.accuracy > MAX_ACCURACY_METERS) continue;
    if (!anchor) {
      anchor = p;
      continue;
    }
    const d = haversineDistanceMeters(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
    if (d < MIN_STEP_METERS) continue;
    const seconds = (p.timestamp.getTime() - anchor.timestamp.getTime()) / 1000;
    // Don't count the straight line across a silence; resume measuring from here.
    if (seconds > TRACKING_GAP_SECONDS) {
      anchor = p;
      continue;
    }
    if (seconds > 0 && d / seconds > MAX_SPEED_MPS) continue;
    total += d;
    anchor = p;
  }
  return total;
}

interface ClusterOptions {
  /** How close consecutive pings need to be to the running centroid to stay in the same visit. */
  radiusMeters?: number;
  /** Longest gap between two pings that still counts as continuous presence. */
  maxGapMs?: number;
  /** Shortest arrival-to-departure span that counts as a real visit, not a fleeting drive-through. */
  minDurationMs?: number;
}

/**
 * Groups a chronological run of location pings into "visits" — spans of
 * time spent within roughly one place. Nominatim's ~1 req/sec usage policy
 * means every raw ping can't be reverse-geocoded individually; clustering
 * first means only a handful of lookups (one per visit) are ever needed.
 */
export function clusterPings(pings: RawPing[], options: ClusterOptions = {}): Visit[] {
  const radiusMeters = options.radiusMeters ?? DEFAULT_RADIUS_METERS;
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;

  const sorted = [...pings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const visits: Visit[] = [];
  let current: RawPing[] = [];

  const closeCurrent = () => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    if (last.timestamp.getTime() - first.timestamp.getTime() >= minDurationMs) {
      visits.push({
        centroidLatitude: current.reduce((sum, p) => sum + p.latitude, 0) / current.length,
        centroidLongitude: current.reduce((sum, p) => sum + p.longitude, 0) / current.length,
        arrivedAt: first.timestamp,
        departedAt: last.timestamp,
      });
    }
    current = [];
  };

  for (const ping of sorted) {
    if (current.length === 0) {
      current.push(ping);
      continue;
    }
    const last = current[current.length - 1];
    const gapMs = ping.timestamp.getTime() - last.timestamp.getTime();
    const centroidLatitude = current.reduce((sum, p) => sum + p.latitude, 0) / current.length;
    const centroidLongitude = current.reduce((sum, p) => sum + p.longitude, 0) / current.length;
    const distanceFromCentroid = haversineDistanceMeters(
      centroidLatitude,
      centroidLongitude,
      ping.latitude,
      ping.longitude,
    );

    if (gapMs <= maxGapMs && distanceFromCentroid <= radiusMeters) {
      current.push(ping);
    } else {
      closeCurrent();
      current.push(ping);
    }
  }
  closeCurrent();

  return visits;
}
