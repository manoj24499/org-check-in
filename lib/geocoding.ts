import { prisma } from "@/lib/prisma";

// Identifies this app to Nominatim, per their usage policy — required, not
// optional. See https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_USER_AGENT = "QubeSpaceCheckin-AdminPanel/1.0";
const MIN_REQUEST_INTERVAL_MS = 1100;
const ROUND_PRECISION = 3; // ~111m grid at the equator

function round(value: number): number {
  const factor = 10 ** ROUND_PRECISION;
  return Math.round(value * factor) / factor;
}

// Simple promise-chained throttle — the first third-party API call in this
// codebase, so there's no existing pattern to reuse. Keeps consecutive
// Nominatim requests at least ~1.1s apart regardless of how many
// reverseGeocode calls fire concurrently within one process.
let throttleChain: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = throttleChain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_REQUEST_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return fn();
  });
  throttleChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchPlaceName(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16`;
  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { display_name?: unknown };
  return typeof data.display_name === "string" ? data.display_name : null;
}

/**
 * Reverse-geocodes a coordinate to a human-readable place name via
 * OpenStreetMap Nominatim (free, no API key — same choice made for the
 * mobile app's live map, to avoid a Google billing account). Best-effort:
 * never throws, returns null on any failure. Rounds to a ~111m grid and
 * caches successful lookups in PlaceNameCache so repeat views of the same
 * day/place never re-hit Nominatim; failures aren't cached, so a transient
 * network error just gets retried on the next request.
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const lat = round(latitude);
  const lon = round(longitude);

  try {
    const cached = await prisma.placeNameCache.findUnique({
      where: { latitude_longitude: { latitude: lat, longitude: lon } },
    });
    if (cached) return cached.placeName;

    const placeName = await throttle(() => fetchPlaceName(lat, lon));
    if (!placeName) return null;

    await prisma.placeNameCache
      .create({ data: { latitude: lat, longitude: lon, placeName } })
      .catch(() => {
        // A concurrent request may have already cached this exact rounded
        // pair (unique constraint) — not a real failure.
      });
    return placeName;
  } catch (error) {
    console.error("[reverseGeocode] failed:", error);
    return null;
  }
}
