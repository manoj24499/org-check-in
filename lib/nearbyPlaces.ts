// Named places (shops, restaurants, schools, colleges, hospitals ...) inside a map window,
// read from OpenStreetMap through the public Overpass API. Used to label the admin
// field-worker map. Results are cached and requests are spaced out, as the Overpass
// usage policy asks.

const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const USER_AGENT = "InzivoCheckin-AdminPanel/1.0";
const MIN_REQUEST_INTERVAL_MS = 1500;
const CACHE_TTL_MS = 12 * 3600 * 1000;
const MAX_CACHE_ENTRIES = 300;
const MAX_RESULTS = 500;
/** The window is widened to this grid so nearby views share one cached answer. */
const GRID = 0.01;
/** Larger windows are refused; the map only asks once it is zoomed in. */
export const MAX_SPAN_DEG = 0.06;

export type PlaceCategory = "food" | "education" | "health" | "shop" | "stay" | "worship" | "service" | "other";

export interface NearbyPlace {
  id: string;
  name: string;
  kind: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const FOOD = new Set(["restaurant", "cafe", "fast_food", "food_court", "bar", "pub", "ice_cream", "biergarten"]);
const EDUCATION = new Set(["school", "college", "university", "kindergarten", "library", "training", "driving_school", "language_school"]);
const HEALTH = new Set(["hospital", "clinic", "doctors", "pharmacy", "dentist", "veterinary"]);
const WORSHIP = new Set(["place_of_worship"]);
const SERVICE = new Set(["bank", "post_office", "police", "fire_station", "townhall", "courthouse", "fuel", "marketplace", "cinema", "bus_station"]);
const AMENITIES = [...FOOD, ...EDUCATION, ...HEALTH, ...WORSHIP, ...SERVICE].join("|");

function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function classify(tags: Record<string, string>): { category: PlaceCategory; kind: string } | null {
  const a = tags.amenity;
  if (a) {
    if (FOOD.has(a)) return { category: "food", kind: humanize(a) };
    if (EDUCATION.has(a)) return { category: "education", kind: humanize(a) };
    if (HEALTH.has(a)) return { category: "health", kind: humanize(a) };
    if (WORSHIP.has(a)) return { category: "worship", kind: tags.religion ? `${humanize(tags.religion)} place of worship` : "Place of worship" };
    if (SERVICE.has(a)) return { category: "service", kind: humanize(a) };
  }
  if (tags.shop) return { category: "shop", kind: tags.shop === "yes" ? "Shop" : humanize(tags.shop) };
  if (tags.tourism) return { category: "stay", kind: humanize(tags.tourism) };
  if (tags.office) return { category: "service", kind: tags.office === "yes" ? "Office" : `${humanize(tags.office)} office` };
  if (tags.leisure) return { category: "other", kind: humanize(tags.leisure) };
  return null;
}

function snap(b: Bounds): Bounds {
  return {
    south: Math.floor(b.south / GRID) * GRID,
    west: Math.floor(b.west / GRID) * GRID,
    north: Math.ceil(b.north / GRID) * GRID,
    east: Math.ceil(b.east / GRID) * GRID,
  };
}

const cache = new Map<string, { at: number; places: NearbyPlace[]; truncated: boolean }>();
const inFlight = new Map<string, Promise<{ places: NearbyPlace[]; truncated: boolean }>>();

let chain: Promise<void> = Promise.resolve();
let lastCallAt = 0;
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_REQUEST_INTERVAL_MS - Date.now());
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

function buildQuery(b: Bounds): string {
  const box = `${b.south.toFixed(4)},${b.west.toFixed(4)},${b.north.toFixed(4)},${b.east.toFixed(4)}`;
  return `[out:json][timeout:20];(
nwr["name"]["amenity"~"^(${AMENITIES})$"](${box});
nwr["name"]["shop"](${box});
nwr["name"]["tourism"~"^(hotel|guest_house|hostel|attraction|museum)$"](${box});
nwr["name"]["office"](${box});
nwr["name"]["leisure"~"^(park|sports_centre|stadium)$"](${box});
);out center tags ${MAX_RESULTS + 1};`;
}

async function queryOverpass(b: Bounds): Promise<{ places: NearbyPlace[]; truncated: boolean }> {
  const body = new URLSearchParams({ data: buildQuery(b) }).toString();
  let lastError: unknown = null;
  // Both public servers, then the first once more: they are shared and sometimes busy.
  for (const [attempt, url] of [OVERPASS_URLS[0], OVERPASS_URLS[1], OVERPASS_URLS[0]].entries()) {
    if (attempt === 2) await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as {
        elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
      };
      const places: NearbyPlace[] = [];
      for (const el of json.elements ?? []) {
        const tags = el.tags;
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (!tags?.name || lat == null || lon == null) continue;
        const cls = classify(tags);
        if (!cls) continue;
        places.push({ id: `${el.type}/${el.id}`, name: tags.name, kind: cls.kind, category: cls.category, latitude: lat, longitude: lon });
      }
      return { places: places.slice(0, MAX_RESULTS), truncated: places.length > MAX_RESULTS };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass unavailable");
}

/** Named places inside `bounds` (widened to a shared grid). Throws if the window is too large or OpenStreetMap cannot be reached. */
export async function getNearbyPlaces(bounds: Bounds): Promise<{ places: NearbyPlace[]; truncated: boolean }> {
  if (bounds.north - bounds.south > MAX_SPAN_DEG || bounds.east - bounds.west > MAX_SPAN_DEG) {
    throw new Error("Zoom in to see nearby places.");
  }
  const b = snap(bounds);
  const key = `${b.south.toFixed(2)},${b.west.toFixed(2)},${b.north.toFixed(2)},${b.east.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { places: hit.places, truncated: hit.truncated };
  const stale = hit ? { places: hit.places, truncated: hit.truncated } : null;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = throttle(() => queryOverpass(b))
      .then((result) => {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, { at: Date.now(), ...result });
        return result;
      })
      .catch((err) => {
        // Old data beats an error when OpenStreetMap cannot be reached.
        if (stale) return stale;
        throw err;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}
