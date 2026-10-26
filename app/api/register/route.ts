import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { normalizeOrgSlug, isValidOrgSlug } from "@/lib/orgSlug";
import { findActiveHold } from "@/lib/billing/holds";
import { issueUserToken } from "@/lib/userToken";
import { APP_BASE_URL } from "@/lib/appUrl";
import { sendEmail, trialActivationEmail } from "@/lib/email";
import { TRIAL_DAYS, TRIAL_EMPLOYEE_LIMIT } from "@/lib/trial";

const ACTIVATION_TTL_MS = 72 * 60 * 60_000;
const TEAM_SIZES = ["1-5", "6-20", "21-50", "51-200", "200+"] as const;

const bodySchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  slug: z.string().min(1),
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().toLowerCase().email(),
  // About the organization, so we know who is trying the product.
  phone: z.string().trim().min(6).max(20).regex(/^[0-9+()\-\s]+$/),
  teamSize: z.enum(TEAM_SIZES),
  industry: z.string().trim().max(80).optional(),
  // An extra address that also gets trial and billing emails.
  extraEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
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

  const [slugTaken, emailTaken, slugHeld] = await Promise.all([
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: parsed.data.adminEmail }, select: { id: true } }),
    // A slug an in-progress paid checkout is actively holding (see
    // lib/billing/holds.ts) — a free-trial signup can't grab it out from
    // under a paying buyer.
    findActiveHold({ slug }),
  ]);
  if (slugTaken || slugHeld) {
    return NextResponse.json({ error: "That organization code is already taken." }, { status: 409 });
  }
  if (emailTaken) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }

  // No password here: the admin sets one from the emailed activation link, which proves the address is theirs
  // and is also when the trial clock starts.
  const { organization, admin, rawToken } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: parsed.data.organizationName,
        slug,
        isTrial: true,
        signupPhone: parsed.data.phone,
        signupTeamSize: parsed.data.teamSize,
        signupIndustry: parsed.data.industry || null,
        billingEmail: parsed.data.extraEmail && parsed.data.extraEmail !== parsed.data.adminEmail ? parsed.data.extraEmail : null,
      },
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
        passwordHash: null,
        // The account this organization would have zero admins without —
        // see the schema comment on User.isOwner.
        isOwner: true,
      },
    });
    const rawToken = await issueUserToken(tx, admin.id, "ACCOUNT_ACTIVATION", ACTIVATION_TTL_MS);
    return { organization, admin, rawToken };
  });

  // The account exists either way; if the email can't be sent the person can ask for a new link from /activate.
  let emailSent = true;
  try {
    await sendEmail({
      to: admin.email,
      ...trialActivationEmail({
        orgName: organization.name,
        adminName: parsed.data.adminName,
        link: `${APP_BASE_URL}/activate?token=${rawToken}`,
        hours: ACTIVATION_TTL_MS / 3_600_000,
        trialDays: TRIAL_DAYS,
        employeeLimit: TRIAL_EMPLOYEE_LIMIT,
      }),
    });
  } catch (err) {
    emailSent = false;
    console.error("[POST /api/register] Failed to send the activation email:", err);
  }

  return NextResponse.json({
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
    admin: { id: admin.id, email: admin.email, employeeCode: admin.employeeCode },
    emailSent,
    trialDays: TRIAL_DAYS,
    employeeLimit: TRIAL_EMPLOYEE_LIMIT,
  });
}
