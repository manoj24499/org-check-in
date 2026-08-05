import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, hash } from "@/lib/credentials";
import { DEFAULT_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";

const actionSchema = z.object({
  action: z.enum([
    "regenerate-pin",
    "set-active",
    "update-wfh-location",
    "clear-wfh-location",
    "set-field-mode",
  ]),
  active: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(1).max(100_000).optional(),
});

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
      createdAt: true,
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
  const json = await req.json().catch(() => null);
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
    const pinHash = await hash(pin);
    await prisma.user.update({ where: { id }, data: { pinHash } });
    return NextResponse.json({ pin });
  }

  if (parsed.data.action === "set-active") {
    await prisma.user.update({
      where: { id },
      data: { active: parsed.data.active ?? true },
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
