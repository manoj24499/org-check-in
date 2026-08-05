import { haversineDistanceMeters } from "@/lib/geofence";

export interface RawPing {
  latitude: number;
  longitude: number;
  timestamp: Date;
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

/** Sum of great-circle distance between every consecutive raw ping, in meters. */
export function computeTotalDistanceMeters(pings: RawPing[]): number {
  let total = 0;
  for (let i = 1; i < pings.length; i++) {
    total += haversineDistanceMeters(
      pings[i - 1].latitude,
      pings[i - 1].longitude,
      pings[i].latitude,
      pings[i].longitude,
    );
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
