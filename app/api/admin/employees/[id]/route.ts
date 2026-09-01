import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, hashPin } from "@/lib/credentials";
import { DEFAULT_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { embedFace } from "@/lib/faceVerify";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";

const actionSchema = z.object({
  action: z.enum([
    "regenerate-pin",
    "set-active",
    "update-wfh-location",
    "clear-wfh-location",
    "set-field-mode",
    "set-face-verification",
  ]),
  active: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(1).max(100_000).optional(),
  enabled: z.boolean().optional(),
  // Optional (re-)enrollment photo for "set-face-verification" — same data
  // URL convention as /api/admin/employees. When supplied, it's sent to the
  // face-verification service's /embed endpoint (see lib/faceVerify.ts) and
  // faceVerificationEnabled only flips on if that succeeds. Omitting it
  // preserves the original behavior: just flip the flag, trusting
  // enrollment already happened out-of-band.
  photo: z.string().optional(),
});

// Same cap as /api/admin/employees's identical constant, for the same
// reason: a base64 photo inflates the request body well past
// MAX_PHOTO_BYTES.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      email: true,
      active: true,
      deactivatedAt: true,
      createdAt: true,
      faceVerificationEnabled: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ employee: user });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "regenerate-pin") {
    const pin = generatePin();
    const pinHash = await hashPin(pin);
    await prisma.user.update({ where: { id }, data: { pinHash } });
    return NextResponse.json({ pin });
  }

  if (parsed.data.action === "set-active") {
    const active = parsed.data.active ?? true;
    await prisma.user.update({
      where: { id },
      // Stamping/clearing deactivatedAt here is what lib/employeeCleanup.ts's
      // 7-day countdown is based on — reactivating (active: true) clears it,
      // so the countdown restarts from scratch if deactivated again later.
      data: { active, deactivatedAt: active ? null : new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "update-wfh-location") {
    if (parsed.data.latitude === undefined || parsed.data.longitude === undefined) {
      return NextResponse.json(
        { error: "Latitude and longitude are required." },
        { status: 400 },
      );
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        workMode: "WFH",
        homeLatitude: parsed.data.latitude,
        homeLongitude: parsed.data.longitude,
        homeRadiusMeters: parsed.data.radiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
      },
    });
    return NextResponse.json({
      workMode: updated.workMode,
      homeLatitude: updated.homeLatitude,
      homeLongitude: updated.homeLongitude,
      homeRadiusMeters: updated.homeRadiusMeters,
    });
  }

  if (parsed.data.action === "clear-wfh-location") {
    // Also doubles as "remove from Anywhere/FIELD" — resetting to OFFICE +
    // null coords is the correct revert regardless of which mode the
    // employee is leaving.
    await prisma.user.update({
      where: { id },
      data: {
        workMode: "OFFICE",
        homeLatitude: null,
        homeLongitude: null,
        homeRadiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "set-face-verification") {
    const enabled = parsed.data.enabled ?? true;

    // A photo means "(re-)enroll now" — decode, embed, and only flip the
    // flag on if the service actually accepts it. Turning verification off,
    // or turning it on with no photo, keeps the original behavior: just
    // flip the flag, trusting enrollment already happened out-of-band.
    if (enabled && parsed.data.photo) {
      const photoBuffer = await decodePhoto(parsed.data.photo);
      if (!photoBuffer) {
        return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
      }
      if (photoBuffer.length > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
      }

      const result = await embedFace(user.employeeCode, photoBuffer);
      if (result.outcome !== "enrolled") {
        const message = result.outcome === "failed" ? result.message : result.reason;
        return NextResponse.json({
          faceVerificationEnabled: user.faceVerificationEnabled,
          faceEnrollment: { status: result.outcome, message },
        });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { faceVerificationEnabled: true },
      });
      return NextResponse.json({
        faceVerificationEnabled: updated.faceVerificationEnabled,
        faceEnrollment: { status: "enrolled" },
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { faceVerificationEnabled: enabled },
    });
    return NextResponse.json({ faceVerificationEnabled: updated.faceVerificationEnabled });
  }

  if (parsed.data.action === "set-field-mode") {
    // Field workers check in from anywhere — no coordinates are stored.
    const updated = await prisma.user.update({
      where: { id },
      data: {
        workMode: "FIELD",
        homeLatitude: null,
        homeLongitude: null,
        homeRadiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
      },
    });
    return NextResponse.json({ workMode: updated.workMode });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
