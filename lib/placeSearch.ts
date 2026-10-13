// Forward search for the admin's "assign places" screen: a typed name or address becomes a short list
// of candidate places with coordinates. OpenRouteService's search (same key as routing) first,
// Nominatim as the fallback. Both are shared public services, so requests are spaced out and cached.

const USER_AGENT = "InzivoCheckin-AdminPanel/1.0";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 300;
const MIN_NOMINATIM_INTERVAL_MS = 1100;

export interface SearchResult {
  label: string;
  name: string;
  latitude: number;
  longitude: number;
}

const cache = new Map<string, { at: number; results: SearchResult[] }>();

let chain: Promise<void> = Promise.resolve();
let lastCallAt = 0;
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_NOMINATIM_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function searchOrs(q: string, focus?: { latitude: number; longitude: number }): Promise<SearchResult[] | null> {
  const key = process.env.ORS_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ api_key: key, text: q, "boundary.country": "IN", size: "8" });
  if (focus) {
    params.set("focus.point.lat", String(focus.latitude));
    params.set("focus.point.lon", String(focus.longitude));
  }
  const res = await fetch(`https://api.openrouteservice.org/geocode/search?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const json = (await res.json()) as {
    features?: { geometry?: { coordinates?: number[] }; properties?: { label?: string; name?: string } }[];
  };
  return (json.features ?? [])
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => ({
      label: f.properties?.label ?? f.properties?.name ?? "",
      name: f.properties?.name ?? f.properties?.label ?? "",
      latitude: f.geometry!.coordinates![1],
      longitude: f.geometry!.coordinates![0],
    }));
}

async function searchNominatim(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", countrycodes: "in", limit: "8", addressdetails: "0" });
  const res = await throttle(() =>
    fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
  );
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const json = (await res.json()) as { display_name?: string; name?: string; lat?: string; lon?: string }[];
  return json
    .filter((r) => r.lat && r.lon)
    .map((r) => ({
      label: r.display_name ?? r.name ?? "",
      name: r.name || (r.display_name ?? "").split(",")[0],
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }));
}

/** Candidate places for `q`, nearest to `focus` first when the search service supports it. */
export async function searchPlaces(q: string, focus?: { latitude: number; longitude: number }): Promise<SearchResult[]> {
  const text = q.trim().slice(0, 200);
  if (text.length < 3) return [];
  const key = text.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  let results: SearchResult[] | null = null;
  try {
    results = await searchOrs(text, focus);
  } catch (err) {
    console.error("[placeSearch] primary search failed:", err instanceof Error ? err.message : err);
  }
  if (!results || results.length === 0) {
    try {
      results = await searchNominatim(text);
    } catch (err) {
      console.error("[placeSearch] fallback search failed:", err instanceof Error ? err.message : err);
      if (!results) throw new Error("Search is unavailable right now.");
    }
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), results });
  return results;
}
