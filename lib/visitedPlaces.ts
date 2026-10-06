import { haversineDistanceMeters } from "@/lib/geofence";
import type { Visit } from "@/lib/locationClustering";

/** Stops (GPS-detected or logged by hand) closer than this are one place. */
export const PLACE_MERGE_RADIUS_METERS = 200;

export interface LoggedStop {
  id: string;
  name: string;
  description: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  remarks: string | null;
  reachedAt: Date;
  latitude: number;
  longitude: number;
  hasPhoto: boolean;
}

export interface PlaceGroup {
  latitude: number;
  longitude: number;
  arrivedAt: Date;
  departedAt: Date;
  /** Total time actually spent here, summed over every stay (a worker who
   * leaves and comes back counts both stays). */
  durationMs: number;
  /** How many separate stays were merged into this place. */
  stays: number;
  logged: LoggedStop[];
}

/**
 * Collapses the raw stop list into distinct *places*. GPS jitter, or a worker
 * walking loops around one site, makes the clusterer emit many "stops" within
 * a few metres of each other — drawing each as a pin buries the map. Here
 * every stop within PLACE_MERGE_RADIUS_METERS of an existing place joins it
 * (weighted centroid, first arrival, last departure, summed time), and each
 * hand-logged visit attaches to the nearest place or, failing that, becomes a
 * place of its own. Returned in order of first arrival.
 */
export function buildPlaces(stays: Visit[], logged: LoggedStop[]): PlaceGroup[] {
  const places: PlaceGroup[] = [];

  const nearest = (lat: number, lng: number) => {
    let best: PlaceGroup | null = null;
    let bestDistance = Infinity;
    for (const p of places) {
      const d = haversineDistanceMeters(p.latitude, p.longitude, lat, lng);
      if (d <= PLACE_MERGE_RADIUS_METERS && d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    return best;
  };

  for (const s of [...stays].sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime())) {
    const ms = Math.max(1, s.departedAt.getTime() - s.arrivedAt.getTime());
    const hit = nearest(s.centroidLatitude, s.centroidLongitude);
    if (hit) {
      const total = hit.durationMs + ms;
      hit.latitude = (hit.latitude * hit.durationMs + s.centroidLatitude * ms) / total;
      hit.longitude = (hit.longitude * hit.durationMs + s.centroidLongitude * ms) / total;
      hit.durationMs = total;
      hit.stays += 1;
      if (s.arrivedAt < hit.arrivedAt) hit.arrivedAt = s.arrivedAt;
      if (s.departedAt > hit.departedAt) hit.departedAt = s.departedAt;
    } else {
      places.push({
        latitude: s.centroidLatitude,
        longitude: s.centroidLongitude,
        arrivedAt: s.arrivedAt,
        departedAt: s.departedAt,
        durationMs: ms,
        stays: 1,
        logged: [],
      });
    }
  }

  for (const v of [...logged].sort((a, b) => a.reachedAt.getTime() - b.reachedAt.getTime())) {
    const hit = nearest(v.latitude, v.longitude);
    if (hit) {
      hit.logged.push(v);
      if (v.reachedAt < hit.arrivedAt) hit.arrivedAt = v.reachedAt;
      if (v.reachedAt > hit.departedAt) hit.departedAt = v.reachedAt;
    } else {
      places.push({
        latitude: v.latitude,
        longitude: v.longitude,
        arrivedAt: v.reachedAt,
        departedAt: v.reachedAt,
        durationMs: 0,
        stays: 0,
        logged: [v],
      });
    }
  }

  return places.sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime());
}

/** "Infantry Road, Tasker Town, Shivajinagar, ..." -> "Infantry Road, Tasker Town". */
export function shortPlaceName(full: string | null): string | null {
  if (!full) return null;
  return full.split(",").slice(0, 2).join(",").trim() || null;
}
