import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { embedFace } from "@/lib/faceVerify";
import { isRateLimited } from "@/lib/rateLimit";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";

// Same cap as the other routes accepting a base64 photo (kiosk scan, field
// visits) — bounds the raw request body before it's ever parsed as JSON,
// since base64 inflates size by ~4/3 over MAX_PHOTO_BYTES.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

const bodySchema = z.object({
  photo: z.string(),
});

/**
 * Enrolls (or re-enrolls) the calling employee's own reference face with the
 * face-verification service (POST /embed — see lib/faceVerify.ts), for the
 * mobile app's first-login "take a selfie" step. This is the mobile
 * counterpart to the photo-at-creation flow in
 * /api/admin/employees — same underlying embedFace() call, same "the
 * service owns the reference photo, this app never stores it" contract.
 *
 * Not idempotent-guarded: calling this again (e.g. a retry after a bad
 * first selfie) simply re-embeds and can only help, since the service is
 * expected to overwrite its stored reference for this employeeCode.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (await isRateLimited(`face-enroll:${auth.sub}`, 60_000, 5)) {
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
      return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await embedFace(user.employeeCode, photoBuffer);

  if (result.outcome === "enrolled") {
    await prisma.user.update({
      where: { id: user.id },
      data: { faceVerificationEnabled: true },
    });
    return NextResponse.json({ status: "enrolled" });
  }
  if (result.outcome === "failed") {
    // The service looked at the photo and rejected it (no face, etc.) —
    // client should let the employee retake and retry.
    return NextResponse.json({ status: "failed", message: result.message });
  }
  // Service unreachable/errored — distinct from "failed" so the client can
  // show "try again shortly" rather than "retake your photo".
  return NextResponse.json({ status: "unavailable", message: result.reason });
}
