import { haversineDistanceMeters } from "@/lib/geofence";

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Straight-line distance matrix over `points` (metres). Used when no road matrix is available. */
export function haversineMatrix(points: LatLng[]): number[][] {
  return points.map((a) =>
    points.map((b) => (a === b ? 0 : haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude))),
  );
}

function pathCost(order: number[], cost: number[][]): number {
  let total = 0;
  let prev = 0; // row 0 is the starting position
  for (const i of order) {
    total += cost[prev][i];
    prev = i;
  }
  return total;
}

/**
 * Visiting order for the stops (row/column 0 of `cost` is the starting position, the rest are
 * stops). Starts with the nearest stop to the start, then repeatedly the nearest unvisited stop
 * to the last one reached, and finally tidies the route with 2-opt so it does not cross itself.
 * `cost` can be road distances, road times or straight-line metres. Returns stop indices (1..n).
 */
export function planOrder(cost: number[][]): number[] {
  const n = cost.length - 1;
  if (n <= 0) return [];

  const left = new Set<number>();
  for (let i = 1; i <= n; i++) left.add(i);
  const order: number[] = [];
  let at = 0;
  while (left.size > 0) {
    let best = -1;
    let bestCost = Infinity;
    for (const i of left) {
      if (cost[at][i] < bestCost) {
        bestCost = cost[at][i];
        best = i;
      }
    }
    order.push(best);
    left.delete(best);
    at = best;
  }

  // 2-opt on the open path: reverse a stretch whenever that makes the whole route shorter.
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (pathCost(candidate, cost) + 1e-6 < pathCost(order, cost)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return order;
}

/** Convenience wrapper: order `stops` from `start` by straight-line distance. */
export function orderStopsStraightLine<T extends LatLng>(start: LatLng | null, stops: T[]): T[] {
  if (stops.length <= 1) return [...stops];
  // With no starting point, begin from the first stop as given.
  const origin = start ?? stops[0];
  const rest = start ? stops : stops.slice(1);
  const matrix = haversineMatrix([origin, ...rest]);
  const idx = planOrder(matrix);
  const ordered = idx.map((i) => rest[i - 1]);
  return start ? ordered : [stops[0], ...ordered];
}
