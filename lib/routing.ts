import { haversineDistanceMeters } from "@/lib/geofence";
import type { LatLng } from "@/lib/placeOrder";

// Road routes and distances for the field workers' assigned places. A hosted OpenStreetMap routing
// service (OpenRouteService) does the work; the API key stays on the server (ORS_API_KEY) and the
// app only ever talks to our own API routes. If there is no key, or the service is down or out of
// quota, everything falls back to straight lines so the app keeps working, just less precisely.
// Swapping in another engine (a self-hosted one, GraphHopper) only touches this file.

const ORS_BASE = "https://api.openrouteservice.org";
const PROFILE = "driving-car";
const TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;
/** Matrix requests are capped by the provider; above this we use straight lines instead. */
export const MAX_MATRIX_POINTS = 50;
/** Straight-line fallback speed, about 25 km/h in traffic. */
const FALLBACK_SPEED_MPS = 7;

export interface RouteStep {
  instruction: string;
  /** OpenRouteService maneuver code: 0 left, 1 right, 2 sharp left, 3 sharp right, 4 slight left,
   * 5 slight right, 6 straight, 7 enter roundabout, 8 exit roundabout, 9 u-turn, 10 arrive,
   * 11 depart, 12 keep left, 13 keep right. */
  type: number;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Indices into `geometry` where this step starts and ends. */
  from: number;
  to: number;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  /** [latitude, longitude] pairs along the road. */
  geometry: [number, number][];
  steps: RouteStep[];
  provider: "openrouteservice" | "straight-line";
}

export interface RoadMatrix {
  distances: number[][];
  durations: number[][];
}

export function routingConfigured(): boolean {
  return Boolean(process.env.ORS_API_KEY);
}

function straightLeg(from: LatLng, to: LatLng, toName?: string): RouteLeg {
  const meters = haversineDistanceMeters(from.latitude, from.longitude, to.latitude, to.longitude);
  const seconds = meters / FALLBACK_SPEED_MPS;
  return {
    distanceMeters: Math.round(meters),
    durationSeconds: Math.round(seconds),
    geometry: [
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ],
    steps: [
      {
        instruction: toName ? `Head towards ${toName}` : "Head towards the destination",
        type: 11,
        name: "",
        distanceMeters: Math.round(meters),
        durationSeconds: Math.round(seconds),
        from: 0,
        to: 1,
      },
      { instruction: "You have arrived", type: 10, name: "", distanceMeters: 0, durationSeconds: 0, from: 1, to: 1 },
    ],
    provider: "straight-line",
  };
}

const cache = new Map<string, { at: number; leg: RouteLeg }>();

/**
 * The road route from `from` to `to` with turn-by-turn steps. Falls back to a straight line when the
 * routing service is not configured or cannot answer.
 */
export async function getRouteLeg(from: LatLng, to: LatLng, toName?: string): Promise<RouteLeg> {
  const key = process.env.ORS_API_KEY;
  if (!key) return straightLeg(from, to, toName);

  const cacheKey = `${from.latitude.toFixed(4)},${from.longitude.toFixed(4)}>${to.latitude.toFixed(5)},${to.longitude.toFixed(5)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.leg;

  try {
    const res = await fetch(`${ORS_BASE}/v2/directions/${PROFILE}/geojson`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/geo+json" },
      body: JSON.stringify({
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
        instructions: true,
        language: "en",
        units: "m",
        // Snap to the nearest road however far it is, shops are often down lanes the profile skips.
        radiuses: [-1, -1],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`routing ${res.status}`);
    const json = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: number[][] };
        properties?: {
          summary?: { distance?: number; duration?: number };
          segments?: {
            steps?: {
              instruction?: string;
              type?: number;
              name?: string;
              distance?: number;
              duration?: number;
              way_points?: [number, number];
            }[];
          }[];
        };
      }[];
    };
    const feature = json.features?.[0];
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) throw new Error("routing: no geometry");
    const steps: RouteStep[] = (feature.properties?.segments?.[0]?.steps ?? []).map((s) => ({
      instruction: s.instruction ?? "",
      type: s.type ?? 6,
      name: s.name && s.name !== "-" ? s.name : "",
      distanceMeters: Math.round(s.distance ?? 0),
      durationSeconds: Math.round(s.duration ?? 0),
      from: s.way_points?.[0] ?? 0,
      to: s.way_points?.[1] ?? 0,
    }));
    const leg: RouteLeg = {
      distanceMeters: Math.round(feature.properties?.summary?.distance ?? 0),
      durationSeconds: Math.round(feature.properties?.summary?.duration ?? 0),
      geometry: coords.map((c) => [Math.round(c[1] * 1e5) / 1e5, Math.round(c[0] * 1e5) / 1e5] as [number, number]),
      steps,
      provider: "openrouteservice",
    };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { at: Date.now(), leg });
    return leg;
  } catch (err) {
    console.error("[routing] directions failed, using a straight line:", err instanceof Error ? err.message : err);
    return straightLeg(from, to, toName);
  }
}

/** Road distances and times between every pair of `points`, or null (use straight lines) when unavailable. */
export async function getRoadMatrix(points: LatLng[]): Promise<RoadMatrix | null> {
  const key = process.env.ORS_API_KEY;
  if (!key || points.length < 2 || points.length > MAX_MATRIX_POINTS) return null;
  try {
    const res = await fetch(`${ORS_BASE}/v2/matrix/${PROFILE}`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => [p.longitude, p.latitude]),
        metrics: ["distance", "duration"],
        units: "m",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`matrix ${res.status}`);
    const json = (await res.json()) as { distances?: (number | null)[][]; durations?: (number | null)[][] };
    if (!json.distances || !json.durations) throw new Error("matrix: empty");
    // A pair with no road connection comes back null: treat it as very far rather than failing.
    const clean = (m: (number | null)[][]) => m.map((row) => row.map((v) => (v == null ? 1e9 : v)));
    return { distances: clean(json.distances), durations: clean(json.durations) };
  } catch (err) {
    console.error("[routing] matrix failed, using straight lines:", err instanceof Error ? err.message : err);
    return null;
  }
}
