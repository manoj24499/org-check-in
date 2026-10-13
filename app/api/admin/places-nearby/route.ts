import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { getNearbyPlaces } from "@/lib/nearbyPlaces";

export const dynamic = "force-dynamic";

/** Named places (shops, restaurants, schools ...) in a map window, for the admin field-worker map. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const [south, west, north, east] = ["south", "west", "north", "east"].map((k) => Number(q.get(k)));
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east || Math.abs(south) > 90 || Math.abs(north) > 90 || Math.abs(west) > 180 || Math.abs(east) > 180) {
    return NextResponse.json({ error: "Invalid map window." }, { status: 400 });
  }

  try {
    const result = await getNearbyPlaces({ south, west, north, east });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load nearby places.";
    const tooBig = message.startsWith("Zoom in");
    return NextResponse.json({ error: tooBig ? message : "Nearby places are unavailable right now." }, { status: tooBig ? 400 : 502 });
  }
}
