import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";
import { findActiveCheckIn } from "@/lib/activeSession";
import { findOpenSegment, serializeSegment, switchHybridSegment } from "@/lib/hybridSegments";

// FIELD: { mode: "OFFICE" | "FIELD" } (unchanged).
// HYBRID: { mode: "TRANSIT", heading: "HOME" | "OFFICE" } — "Switch to Home" / "Switch to Office";
//         { mode: "OFFICE" | "HOME" } — "I've arrived" (or a direct correction);
//         { extend: true } — "Still travelling": restarts the transit window.
const bodySchema = z.union([
  z.object({ extend: z.literal(true) }),
  z.object({
    mode: z.enum(["OFFICE", "FIELD", "HOME", "TRANSIT"]),
    heading: z.enum(["OFFICE", "HOME"]).optional(),
  }),
]);

/**
 * Manual correction of the current work segment — for when GPS
 * auto-detection (see /api/kiosk/location's evaluateWorkSegment /
 * evaluateHybridSegment) is late, wrong, or unavailable (e.g. indoors).
 * FIELD profiles switch between Field and Office; HYBRID profiles move
 * between Office, Transit and Home. OFFICE/WFH employees have no segment
 * timeline to switch. Hybrid-only modes are rejected for FIELD employees and
 * FIELD for hybrid ones.
 */
export async function POST(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user || (user.workMode !== "FIELD" && user.workMode !== "HYBRID")) {
    return NextResponse.json({ error: "This only applies to Field or Hybrid employees." }, { status: 400 });
  }

  if (user.workMode === "FIELD") {
    if ("extend" in body || (body.mode !== "OFFICE" && body.mode !== "FIELD")) {
      return NextResponse.json({ error: "This only applies to Hybrid employees." }, { status: 400 });
    }
  } else if ("extend" in body) {
    // checked below, once the current segment is known
  } else if (body.mode === "FIELD") {
    return NextResponse.json({ error: "This only applies to Field-mode employees." }, { status: 400 });
  } else if (body.mode === "TRANSIT" && !body.heading) {
    return NextResponse.json({ error: "Say where you're heading (HOME or OFFICE)." }, { status: 400 });
  }

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) {
    return NextResponse.json({ error: "You're not checked in right now." }, { status: 409 });
  }

  const current = await findOpenSegment(checkIn.id);
  const now = new Date();

  // FIELD — unchanged behaviour and response shape.
  if (user.workMode === "FIELD" && !("extend" in body)) {
    if (current?.mode === body.mode) {
      // Already in the requested mode — nothing to do.
      return NextResponse.json({ mode: current.mode, startedAt: current.startedAt.toISOString() });
    }
    const createSegment = prisma.workSegment.create({
      data: { attendanceId: checkIn.id, mode: body.mode, startedAt: now, startMethod: "MANUAL" },
    });
    const created = current
      ? (
          await prisma.$transaction([
            prisma.workSegment.update({ where: { id: current.id }, data: { endedAt: now } }),
            createSegment,
          ])
        )[1]
      : await createSegment;
    return NextResponse.json({ mode: created.mode, startedAt: created.startedAt.toISOString() });
  }

  // HYBRID — "Still travelling": a fresh transit window from now.
  if ("extend" in body) {
    if (current?.mode !== "TRANSIT") {
      return NextResponse.json({ error: "You're not travelling right now." }, { status: 409 });
    }
    const updated = await prisma.workSegment.update({
      where: { id: current.id },
      data: { extendedAt: now, promptedAt: null },
    });
    return NextResponse.json(serializeSegment(updated, now));
  }

  const mode = body.mode as "OFFICE" | "HOME" | "TRANSIT";
  const heading = mode === "TRANSIT" ? (body.heading ?? null) : null;

  // Already there (same mode, and for TRANSIT the same heading) — nothing to do.
  if (current && current.mode === mode && (mode !== "TRANSIT" || current.heading === heading)) {
    return NextResponse.json(serializeSegment(current, now));
  }

  const created = await switchHybridSegment({
    attendanceId: checkIn.id,
    current,
    mode,
    heading,
    startMethod: "MANUAL",
    at: now,
  });
  if (!created) {
    // A location ping switched the segment at the same moment — report where things stand now.
    return NextResponse.json(
      { error: "Your status just changed. Please try again.", ...serializeSegment(await findOpenSegment(checkIn.id), now) },
      { status: 409 },
    );
  }
  return NextResponse.json(serializeSegment(created, now));
}

/**
 * The current segment, for the mobile app's live indicator:
 * { mode, startedAt, heading, promptedAt, transitMinutes, transitWindowEndsAt, transitExpired }.
 * All null/false when not checked in or there's no segment (OFFICE/WFH employees).
 */
export async function GET(req: NextRequest) {
  const auth = await requireMobileUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkIn = await findActiveCheckIn(auth.sub);
  if (!checkIn) return NextResponse.json(serializeSegment(null));

  const current = await findOpenSegment(checkIn.id);
  return NextResponse.json(serializeSegment(current));
}
