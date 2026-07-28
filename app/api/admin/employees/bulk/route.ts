import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { generatePin, generateQrToken, hash, nextEmployeeCode } from "@/lib/credentials";
import { DEFAULT_GEOFENCE_RADIUS_METERS } from "@/lib/geofence";

const bulkCreateSchema = z.array(
  z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      workMode: z.enum(["OFFICE", "WFH"]).default("OFFICE"),
      homeLatitude: z.coerce.number().min(-90).max(90).optional(),
      homeLongitude: z.coerce.number().min(-180).max(180).optional(),
      homeRadiusMeters: z.coerce.number().min(1).max(100_000).optional(),
    })
    .refine(
      (row) => row.workMode !== "WFH" || (row.homeLatitude !== undefined && row.homeLongitude !== undefined),
      { message: "WFH employees require Home Latitude and Home Longitude." },
    ),
);

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bulkCreateSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowIndex = typeof issue?.path[0] === "number" ? issue.path[0] : undefined;
    const rowLabel =
      rowIndex !== undefined && Array.isArray(json)
        ? (json[rowIndex]?.email ?? `row ${rowIndex + 1}`)
        : undefined;
    return NextResponse.json(
      {
        error: rowLabel
          ? `Invalid data for ${rowLabel}: ${issue?.message ?? "check the row and try again."}`
          : "Invalid input. Ensure rows have valid name, email, and (for WFH) home coordinates.",
      },
      { status: 400 },
    );
  }

  const existingEmails = await prisma.user.findMany({
    where: { email: { in: parsed.data.map(u => u.email) } },
    select: { email: true }
  });

  if (existingEmails.length > 0) {
    return NextResponse.json({
      error: `Some emails are already in use: ${existingEmails.map(e => e.email).join(', ')}`
    }, { status: 409 });
  }

  // To avoid race conditions in employeeCode generation, we'll fetch the count once
  let employeeCount = await prisma.user.count({ where: { role: "EMPLOYEE" } });

  const createdEmployees = [];

  // We loop because we need to await hash for each PIN
  for (const empData of parsed.data) {
    const employeeCode = nextEmployeeCode("EMP", employeeCount);
    employeeCount++;

    const pin = generatePin();
    const qrToken = generateQrToken();
    const pinHash = await hash(pin);

    const user = await prisma.user.create({
      data: {
        name: empData.name,
        email: empData.email,
        role: "EMPLOYEE",
        employeeCode,
        pinHash,
        qrToken,
        workMode: empData.workMode,
        homeLatitude: empData.workMode === "WFH" ? empData.homeLatitude : null,
        homeLongitude: empData.workMode === "WFH" ? empData.homeLongitude : null,
        homeRadiusMeters: empData.homeRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS,
      },
    });

    createdEmployees.push({
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      pin,
    });
  }

  return NextResponse.json({
    created: createdEmployees
  });
}
