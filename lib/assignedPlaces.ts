import type { AssignedPlace, FieldVisit } from "@prisma/client";
import { haversineDistanceMeters } from "@/lib/geofence";
import { getRoadMatrix } from "@/lib/routing";
import { haversineMatrix, planOrder, type LatLng } from "@/lib/placeOrder";

export const MAX_PLACES_PER_DAY = 40;
const FALLBACK_SPEED_MPS = 7;

export interface AssignedPlaceDto {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  sortOrder: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
  skipReason: string | null;
  /** When the linked visit was logged (VISITED places only). */
  visitedAt: string | null;
}

export function toAssignedPlaceDto(p: AssignedPlace & { fieldVisit?: Pick<FieldVisit, "reachedAt"> | null }): AssignedPlaceDto {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    description: p.description,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    notes: p.notes,
    sortOrder: p.sortOrder,
    status: p.status,
    skipReason: p.skipReason,
    visitedAt: p.fieldVisit?.reachedAt.toISOString() ?? null,
  };
}

export interface PlannedStop<T> {
  stop: T;
  /** Road (or straight-line) distance and time from the previous stop, or from the start for the first. */
  distanceMeters: number;
  durationSeconds: number;
}

export interface VisitPlan<T> {
  ordered: PlannedStop<T>[];
  /** True when road distances were used, false when only straight lines were available. */
  roads: boolean;
}

/**
 * Puts `stops` in visiting order: the one nearest to `start` first, then the nearest to that one, and
 * so on, using road distances when the routing service answers. With no start the first stop stays
 * first. The route is tidied so it does not double back on itself.
 */
export async function planVisitOrder<T extends LatLng>(start: LatLng | null, stops: T[]): Promise<VisitPlan<T>> {
  if (stops.length === 0) return { ordered: [], roads: false };
  const origin: LatLng = start ?? stops[0];
  const rest = start ? stops : stops.slice(1);
  const points: LatLng[] = [origin, ...rest];

  const matrix = points.length > 1 ? await getRoadMatrix(points) : null;
  const cost = matrix ? matrix.distances : haversineMatrix(points);
  const idx = planOrder(cost);

  const ordered: PlannedStop<T>[] = [];
  if (!start) ordered.push({ stop: stops[0], distanceMeters: 0, durationSeconds: 0 });
  let prev = 0;
  for (const i of idx) {
    const meters = matrix ? matrix.distances[prev][i] : haversineDistanceMeters(points[prev].latitude, points[prev].longitude, points[i].latitude, points[i].longitude);
    const seconds = matrix ? matrix.durations[prev][i] : meters / FALLBACK_SPEED_MPS;
    ordered.push({ stop: rest[i - 1], distanceMeters: Math.round(meters), durationSeconds: Math.round(seconds) });
    prev = i;
  }
  return { ordered, roads: matrix !== null };
}
