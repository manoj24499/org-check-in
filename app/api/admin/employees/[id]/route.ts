import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, generateQrToken, hash } from "@/lib/credentials";
import { DEFAULT_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";

const actionSchema = z.object({
  action: z.enum([
    "regenerate-pin",
    "regenerate-qr",
    "set-active",
    "update-wfh-location",
    "clear-wfh-location",
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
      qrToken: true,
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

  if (parsed.data.action === "regenerate-qr") {
    const qrToken = generateQrToken();
    await prisma.user.update({ where: { id }, data: { qrToken } });
    return NextResponse.json({ qrToken });
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
