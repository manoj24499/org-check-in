import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { decodePhoto, MAX_PHOTO_BYTES } from "@/lib/photoUpload";
import { PayloadTooLargeError, readJsonWithLimit } from "@/lib/readJsonBody";
import { findActiveCheckIn } from "@/lib/activeSession";

// See kiosk/scan/route.ts's identical constant for why this is larger than
// MAX_PHOTO_BYTES: it bounds the raw request body (base64 inflates size by
// ~4/3), checked before the body is ever parsed as JSON.
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  // Who was met at the site, plus free-text remarks — all optional.
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  contactEmail: z.string().trim().max(160).email().optional().or(z.literal("")),
  remarks: z.string().trim().max(1000).optional(),
  photo: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Set when this visit completes a place an admin assigned (see AssignedPlace).
  assignedPlaceId: z.string().min(1).max(40).optional(),
  // Present when the phone saved this visit while offline and is sending it later. `clientId` makes a retry
  // idempotent; `reachedAt` is when the worker actually got there (the phone's clock), used instead of "now".
  clientId: z.string().regex(/^[A-Za-z0-9-]{16,64}$/).optional(),
  reachedAt: z.string().datetime({ offset: true }).optional(),
});

/** A visit saved offline may reach the server hours later (or after the worker already checked out); it is
 * attached to the Field check-in it happened during, if that was no more than this long before. */
const MAX_VISIT_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_VISIT_SESSION_MS = 24 * 60 * 60 * 1000;
const FUTURE_SLACK_MS = 2 * 60 * 1000;

function visitResponse(visit: {
  id: string; name: string; description: string | null; contactName: string | null; contactPhone: string | null;
  contactEmail: string | null; remarks: string | null; reachedAt: Date; latitude: number; longitude: number;
}) {
  return {
    id: visit.id,
    name: visit.name,
    description: visit.description,
    contactName: visit.contactName,
    contactPhone: visit.contactPhone,
    contactEmail: visit.contactEmail,
    remarks: visit.remarks,
    reachedAt: visit.reachedAt.toISOString(),
    latitude: visit.latitude,
    longitude: visit.longitude,
  };
}

/** The active FIELD check-in — the parent every FieldVisit hangs off. Built
 * on the shared findActiveCheckIn (see lib/activeSession.ts) so an overnight
 * shift's session is recognized here too, past midnight. */
async function findTodaysFieldCheckIn(userId: string) {
  const active = await findActiveCheckIn(userId);
  if (!active) return null;
  return prisma.attendance.findUnique({
    where: { id: active.id },
    select: { id: true, checkInMode: true },
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findTodaysFieldCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json({ visits: [] });

  const visits = await prisma.fieldVisit.findMany({
    where: { attendanceId: checkIn.id },
    orderBy: { reachedAt: "asc" },
    select: { id: true, name: true, description: true, contactName: true, contactPhone: true, contactEmail: true, remarks: true, reachedAt: true, latitude: true, longitude: true, hasPhoto: true },
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      contactName: v.contactName,
      contactPhone: v.contactPhone,
      contactEmail: v.contactEmail,
      remarks: v.remarks,
      reachedAt: v.reachedAt.toISOString(),
      latitude: v.latitude,
      longitude: v.longitude,
      hasPhoto: v.hasPhoto,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await readJsonWithLimit(req, MAX_REQUEST_BYTES);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The same visit sent again (a reply was lost): return what was already recorded.
  if (parsed.data.clientId) {
    const existing = await prisma.fieldVisit.findUnique({
      where: { clientId: parsed.data.clientId },
      select: {
        id: true, name: true, description: true, contactName: true, contactPhone: true, contactEmail: true,
        remarks: true, reachedAt: true, latitude: true, longitude: true, attendance: { select: { userId: true } },
      },
    });
    if (existing) {
      if (existing.attendance.userId !== auth.sub) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      return NextResponse.json({ ...visitResponse(existing), idempotentReplay: true });
    }
  }

  // Older app builds (the dashboard "Log a visit" card) sent the camera's bare
  // base64 instead of a data URL; accept both so those installs keep working.
  const photoInput = parsed.data.photo.startsWith("data:")
    ? parsed.data.photo
    : `data:image/jpeg;base64,${parsed.data.photo}`;
  const photoBuffer = await decodePhoto(photoInput);
  if (!photoBuffer) {
    return NextResponse.json({ error: "Invalid photo data." }, { status: 400 });
  }
  if (photoBuffer.length > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
  }

  // A visit the phone saved earlier belongs to the Field check-in it happened during, which may be over by now.
  let reachedAt: Date | null = null;
  let checkIn: { id: string; checkInMode: string | null } | null;
  if (parsed.data.reachedAt) {
    reachedAt = new Date(parsed.data.reachedAt);
    const now = Date.now();
    if (reachedAt.getTime() > now + FUTURE_SLACK_MS || now - reachedAt.getTime() > MAX_VISIT_AGE_MS) {
      return NextResponse.json({ error: "This visit is too old to record automatically." }, { status: 422 });
    }
    const during = await prisma.attendance.findFirst({
      where: { userId: auth.sub, type: "CHECK_IN", timestamp: { lte: reachedAt } },
      orderBy: { timestamp: "desc" },
      select: { id: true, checkInMode: true, timestamp: true },
    });
    checkIn = during && reachedAt.getTime() - during.timestamp.getTime() <= MAX_VISIT_SESSION_MS ? during : null;
  } else {
    checkIn = await findTodaysFieldCheckIn(auth.sub);
  }
  if (!checkIn || checkIn.checkInMode !== "FIELD") {
    return NextResponse.json(
      { error: "Check in with Field mode first to log a location." },
      { status: 409 },
    );
  }

  // The assigned place being completed must be the caller's own and still pending.
  if (parsed.data.assignedPlaceId) {
    const place = await prisma.assignedPlace.findFirst({
      where: { id: parsed.data.assignedPlaceId, userId: auth.sub, status: "PENDING" },
      select: { id: true },
    });
    if (!place) {
      return NextResponse.json({ error: "That assigned place is no longer available." }, { status: 409 });
    }
  }

  let visit;
  try {
    visit = await prisma.fieldVisit.create({
    data: {
      attendanceId: checkIn.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      contactName: parsed.data.contactName || null,
      contactPhone: parsed.data.contactPhone || null,
      contactEmail: parsed.data.contactEmail || null,
      remarks: parsed.data.remarks || null,
      photo: photoBuffer,
      hasPhoto: true,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      ...(reachedAt ? { reachedAt } : {}),
      ...(parsed.data.clientId ? { clientId: parsed.data.clientId } : {}),
      ...(parsed.data.assignedPlaceId
        ? { assignedPlace: { connect: { id: parsed.data.assignedPlaceId } } }
        : {}),
    },
  });
  } catch (err) {
    // Two copies of the same offline visit arrived together: the other one won, so report it as recorded.
    if (parsed.data.clientId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.fieldVisit.findUnique({ where: { clientId: parsed.data.clientId } });
      if (winner) return NextResponse.json({ ...visitResponse(winner), idempotentReplay: true });
    }
    throw err;
  }
  if (parsed.data.assignedPlaceId) {
    await prisma.assignedPlace.update({ where: { id: parsed.data.assignedPlaceId }, data: { status: "VISITED" } });
  }

  return NextResponse.json(visitResponse(visit));
}
