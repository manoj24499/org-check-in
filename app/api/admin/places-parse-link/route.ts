import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { isAllowedMapHost, parseMapInput } from "@/lib/mapLinks";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });
const MAX_REDIRECTS = 4;

/**
 * Opens a Google short link (maps.app.goo.gl/...) to find where it points, following redirects by hand
 * and only through Google's own hosts, so this can never be used to make the server fetch an arbitrary
 * address.
 */
async function resolveShortLink(startUrl: string) {
  let current = startUrl;
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const url = new URL(current);
    if (url.protocol !== "https:" || !isAllowedMapHost(url.hostname)) return null;
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0" } });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return null;
    current = new URL(location, url).toString();
    const parsed = parseMapInput(current);
    if (parsed && parsed.latitude !== undefined) return parsed;
    if (parsed && !parsed.needsResolve && parsed.name) return parsed;
  }
  return null;
}

/** Turns pasted text (coordinates or a Google Maps link) into a map position for the assign-places screen. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const result = parseMapInput(parsed.data.text);
  if (!result) {
    return NextResponse.json(
      { error: "That does not look like coordinates or a Google Maps link. Try \"11.0406, 77.0384\" or a link copied from Google Maps." },
      { status: 422 },
    );
  }
  if (result.latitude !== undefined && result.longitude !== undefined) {
    return NextResponse.json({ latitude: result.latitude, longitude: result.longitude, name: result.name ?? null });
  }
  if (result.needsResolve) {
    try {
      const text = parsed.data.text.trim();
      const resolved = await resolveShortLink(/^https?:\/\//i.test(text) ? text : `https://${text}`);
      if (resolved?.latitude !== undefined && resolved.longitude !== undefined) {
        return NextResponse.json({ latitude: resolved.latitude, longitude: resolved.longitude, name: resolved.name ?? result.name ?? null });
      }
      if (resolved?.name ?? result.name) return NextResponse.json({ name: resolved?.name ?? result.name, needsSearch: true });
    } catch {
      // fall through to the message below
    }
    return NextResponse.json({ error: "Could not open that short link. Paste the full link, or the coordinates, instead." }, { status: 422 });
  }
  // A link that only names the place: let the admin search for it.
  return NextResponse.json({ name: result.name, needsSearch: true });
}
