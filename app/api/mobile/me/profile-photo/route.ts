import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { isRateLimited } from "@/lib/rateLimit";

const bodySchema = z.object({
  // Data URL, same convention as every other photo upload in this app
  // (kiosk scan, field visits, overtime checkout, support tickets) —
  // required here (unlike those, where a photo is always optional): this
  // route's whole purpose is setting a photo.
  photo: z.string(),
});

// Same cap as the other photo-accepting mobile routes.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/**
 * Employee self-service profile photo — set from the mobile app's Profile
 * screen. No admin upload path exists (deliberately): this is the
 * employee's own photo of themselves, not something an admin sets on their
 * behalf. Replaces any existing photo outright; there's no history kept.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // decodePhoto() below does a real sharp decode/resize/re-encode — genuine
  // CPU cost, not just a DB write — so an authenticated employee spamming
  // this endpoint is a real, if minor, cost-amplification vector. Same
  // reasoning as change-pin's identical rate limit.
  if (await isRateLimited(`profile-photo:${auth.sub}`, 60_000, 10)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const photoBuffer = await decodePhoto(parsed.data.photo);
  if (!photoBuffer) {
    return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
  }
  if (photoBuffer.length > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
  }

  await prisma.user.update({
    where: { id: auth.sub },
    data: { profilePhoto: Buffer.from(photoBuffer), hasProfilePhoto: true },
  });

  return NextResponse.json({ success: true });
}

/** Serves the caller's own profile photo — used by the mobile app's
 * Profile screen to render its own avatar (bearer-token-authenticated
 * image fetch, same pattern as /api/mobile/field-visits/[id]/photo). */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // `profilePhoto` is omitted by the Prisma client's global default (see
  // lib/prisma.ts) — an explicit `select` bypasses that default entirely
  // for this query (per Prisma's own docs on `omit`), which is preferable
  // to the `omit: {profilePhoto: false}` override every OTHER dedicated
  // photo route in this app uses: those models have nothing sensitive
  // beyond the photo itself, but User also carries pinHash/passwordHash —
  // worth actually narrowing the query here rather than pulling the whole
  // row just to read one field.
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { profilePhoto: true },
  });

  if (!user?.profilePhoto) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(user.profilePhoto), {
    headers: {
      "Content-Type": "image/jpeg",
      // `no-store`, not `private, max-age=...` — this exact URL is reused
      // across logins on the same device with no per-user component and no
      // `Vary: Authorization`, so an HTTP cache honoring `private` is
      // technically permitted to serve one employee's cached photo bytes
      // back to a *different* employee signed in afterward on the same
      // device (a shared/reissued phone within the cache window). A single
      // small avatar image refetched on every screen visit is a trivial
      // cost next to that risk — this isn't a hot path.
      "Cache-Control": "private, no-store",
    },
  });
}
