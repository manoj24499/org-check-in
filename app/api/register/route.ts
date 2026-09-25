import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeOrgSlug, isValidOrgSlug } from "@/lib/orgSlug";

const bodySchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  slug: z.string().min(1),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(8).max(200),
});

/**
 * Self-serve organization signup — creates a new Organization plus its
 * first (owner) admin in one transaction. Previously the only way an admin
 * account could ever be created was prisma/seed.ts, a manual script; this
 * is the real onboarding path for a new organization now (see that script's
 * own updated comment).
 *
 * A brand-new unauthenticated write endpoint, so it gets the same abuse
 * guard every other login/credential surface in this app already has (see
 * lib/auth.ts's checkLoginRateLimit and /api/mobile/login).
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/register] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`register:${ip}`, 60_000, 5)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const slug = normalizeOrgSlug(parsed.data.slug);
  if (!isValidOrgSlug(slug)) {
    return NextResponse.json(
      { error: "Organization code must be 2-40 characters: lowercase letters, numbers, and hyphens only." },
      { status: 400 },
    );
  }

  const [slugTaken, emailTaken] = await Promise.all([
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: parsed.data.adminEmail }, select: { id: true } }),
  ]);
  if (slugTaken) {
    return NextResponse.json({ error: "That organization code is already taken." }, { status: 409 });
  }
  if (emailTaken) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.adminPassword, 10);

  const { organization, admin } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: parsed.data.organizationName, slug },
    });
    // Created immediately, not lazily on first read — see the schema
    // comment on AppSettings and lib/settings.ts's getSettings().
    await tx.appSettings.create({ data: { organizationId: organization.id } });
    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: parsed.data.adminName,
        email: parsed.data.adminEmail,
        role: "ADMIN",
        employeeCode: "ADM001",
        passwordHash,
        // The account this organization would have zero admins without —
        // see the schema comment on User.isOwner.
        isOwner: true,
      },
    });
    return { organization, admin };
  });

  return NextResponse.json({
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    admin: { id: admin.id, email: admin.email, employeeCode: admin.employeeCode },
  });
}
