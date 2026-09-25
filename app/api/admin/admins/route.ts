import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

/** Every admin in the caller's own organization — for the Settings page's
 * Admins list. Without this (and the POST below), an organization is
 * permanently single-admin with no in-app way to add a second one. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admins = await prisma.user.findMany({
    where: { organizationId: admin.organizationId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, isOwner: true, active: true, createdAt: true },
  });

  return NextResponse.json({ admins });
}

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

/** Adds another admin to the caller's own organization — never the owner
 * flag (see the schema comment on User.isOwner): only the first admin
 * created at registration ever gets that. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  // Admin codes aren't allocated through the same persistent counter as
  // employee codes (allocateNextEmployeeCode) — there's no delete/reuse
  // path for admins in this app yet (see the schema comment on
  // User.isOwner), so a plain per-org count is safe here, matching the
  // same pattern prisma/seed.ts already uses.
  const adminCount = await prisma.user.count({ where: { organizationId: admin.organizationId, role: "ADMIN" } });
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const created = await prisma.user.create({
    data: {
      organizationId: admin.organizationId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: "ADMIN",
      employeeCode: `ADM${String(adminCount + 1).padStart(3, "0")}`,
      passwordHash,
      isOwner: false,
    },
    select: { id: true, name: true, email: true, isOwner: true, active: true, createdAt: true },
  });

  return NextResponse.json({ admin: created });
}
