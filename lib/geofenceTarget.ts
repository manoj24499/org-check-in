import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";
import type { GeofenceTarget } from "@/lib/geofence";

export type { GeofenceTarget };

/**
 * Resolves which location (if any) an employee should be geofenced against —
 * shared by the check-in gate (scan route) and the auto-pause ping evaluator
 * (location route) so the two never drift apart. FIELD workers are never
 * geofenced. Returns null if nothing is configured yet (WFH with no home
 * location saved, or no OfficeLocation row at all) — geofencing is simply
 * not enforced in that case, same precedent as everywhere else it's used.
 *
 * Server-only (imports Prisma) — kept separate from lib/geofence.ts, which
 * app/kiosk/page.tsx (a Client Component) imports directly for the pure
 * haversineDistanceMeters math.
 */
export async function resolveGeofenceTarget(
  user: Pick<User, "workMode" | "homeLatitude" | "homeLongitude" | "homeRadiusMeters">,
): Promise<GeofenceTarget | null> {
  if (user.workMode === "FIELD") return null;

  if (user.workMode === "WFH") {
    if (user.homeLatitude == null || user.homeLongitude == null) return null;
    return {
      latitude: user.homeLatitude,
      longitude: user.homeLongitude,
      radiusMeters: user.homeRadiusMeters,
    };
  }

  const officeLocation = await prisma.officeLocation.findFirst({ orderBy: { createdAt: "asc" } });
  if (!officeLocation) return null;
  return {
    latitude: officeLocation.latitude,
    longitude: officeLocation.longitude,
    radiusMeters: officeLocation.radiusMeters,
  };
}

/**
 * The shared office location, regardless of the caller's workMode — unlike
 * resolveGeofenceTarget above, which deliberately returns null for FIELD
 * profiles. Used by /api/kiosk/location's evaluateWorkSegment to ask "has
 * this FIELD employee physically reached the office", a different question
 * from "should this profile be geofenced at all". Returns null only if no
 * OfficeLocation has been configured yet.
 */
export async function resolveOfficeLocationTarget(): Promise<GeofenceTarget | null> {
  const officeLocation = await prisma.officeLocation.findFirst({ orderBy: { createdAt: "asc" } });
  if (!officeLocation) return null;
  return {
    latitude: officeLocation.latitude,
    longitude: officeLocation.longitude,
    radiusMeters: officeLocation.radiusMeters,
  };
}
