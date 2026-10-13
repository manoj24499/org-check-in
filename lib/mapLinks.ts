// Turning whatever an admin pastes (a Google Maps link, "11.04, 77.03", a Google short link) into
// coordinates. Parsing is pure; resolving short links is done by the caller, only for hosts that
// pass `isAllowedMapHost`, so the server never fetches an arbitrary address.

export interface ParsedMapInput {
  latitude?: number;
  longitude?: number;
  /** A place name found in the link (e.g. /maps/place/Some+Shop/), useful for a search. */
  name?: string;
  /** True when the text is a link that has to be opened to find the coordinates. */
  needsResolve?: boolean;
}

const NUM = "-?\\d{1,3}(?:\\.\\d+)?";

function valid(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function pair(lat: string, lng: string): ParsedMapInput | null {
  const la = Number(lat);
  const lo = Number(lng);
  return valid(la, lo) ? { latitude: la, longitude: lo } : null;
}

const ALLOWED_HOSTS = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/, /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/];

export function isAllowedMapHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((re) => re.test(h));
}

export function parseMapInput(raw: string): ParsedMapInput | null {
  const text = raw.trim();
  if (!text) return null;

  // Plain coordinates: "11.0406, 77.0384" or "11.0406 77.0384".
  const plain = new RegExp(`^\\(?\\s*(${NUM})\\s*[,;\\s]\\s*(${NUM})\\s*\\)?$`).exec(text);
  if (plain) return pair(plain[1], plain[2]);

  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!isAllowedMapHost(url.hostname)) return null;

  const decoded = decodeURIComponent(url.pathname + url.search + url.hash.replace(/^#/, ""));
  // The pin Google dropped (!3dLAT!4dLNG) is more exact than the viewport centre (@lat,lng).
  const pin = new RegExp(`!3d(${NUM})!4d(${NUM})`).exec(decoded);
  if (pin) return withName(pair(pin[1], pin[2]), url);
  const query = new RegExp(`[?&](?:q|ll|query|destination|daddr|center)=\\s*(${NUM})\\s*,\\s*(${NUM})`).exec(url.search + (url.hash ? `&${url.hash.slice(1)}` : ""));
  if (query) return withName(pair(query[1], query[2]), url);
  const at = new RegExp(`@(${NUM}),(${NUM})`).exec(decoded);
  if (at) return withName(pair(at[1], at[2]), url);

  // A short link, or a link with only a place name: it has to be opened (or searched) to locate it.
  const name = placeNameFrom(url);
  if (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl") return { needsResolve: true, ...(name ? { name } : {}) };
  return name ? { name } : null;
}

function placeNameFrom(url: URL): string | undefined {
  const m = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
  if (m) return decodeURIComponent(m[1].replace(/\+/g, " "));
  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (q && !new RegExp(`^${NUM}\\s*,\\s*${NUM}$`).test(q.trim())) return q.trim();
  return undefined;
}

function withName(coords: ParsedMapInput | null, url: URL): ParsedMapInput | null {
  if (!coords) return null;
  const name = placeNameFrom(url);
  return name ? { ...coords, name } : coords;
}
