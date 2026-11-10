// Client-safe geofence math only — no server-only imports (Prisma, etc.)
// belong here. app/kiosk/page.tsx (a Client Component) imports
// haversineDistanceMeters directly, so anything in this file gets bundled
// into the browser. Server-only geofence resolution lives in
// lib/geofenceTarget.ts instead.

export const DEFAULT_GEOFENCE_RADIUS_METERS = 50;
// Suggested home radius for a HYBRID employee (admin can change it) — a bit
// wider than the default so arriving home is detected at the door, not the desk.
export const HYBRID_DEFAULT_HOME_RADIUS_METERS = 100;

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export interface GeofenceTarget {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}
