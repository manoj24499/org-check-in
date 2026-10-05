import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { issueUserToken } from "@/lib/userToken";
import { APP_BASE_URL } from "@/lib/appUrl";
import { sendEmail, passwordResetEmail } from "@/lib/email";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

const RESET_TTL_MS = 60 * 60_000;

/**
 * Emails a password-reset link to an activated admin. Always responds 200
 * { ok: true } whether or not the email matched, was rate-limited, or was
 * invalid — same non-enumeration rule as app/api/activate/resend/route.ts.
 */
export async function POST(req: NextRequest) {
  try {
    await handlePost(req);
  } catch (err) {
    console.error("[POST /api/password-reset/request] Unhandled error:", err);
  }
  return NextResponse.json({ ok: true });
}

async function handlePost(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return;

  const ip = getClientIp(req);
  const email = parsed.data.email;
  if (await isRateLimited(`pw-reset:ip:${ip}`, 10 * 60_000, 5)) return;
  if (await isRateLimited(`pw-reset:email:${email}`, 60 * 60_000, 3)) return;

  // Only activated admins: accounts still awaiting activation use the
  // activation link instead, and employees sign in with a PIN, not a password.
  const user = await prisma.user.findFirst({
    where: { email, role: "ADMIN", active: true, passwordHash: { not: null } },
    select: { id: true, name: true },
  });
  if (!user) return;

  const raw = await prisma.$transaction((tx) => issueUserToken(tx, user.id, "PASSWORD_RESET", RESET_TTL_MS));
  const link = `${APP_BASE_URL}/reset-password?token=${raw}`;
  await sendEmail({ to: email, ...passwordResetEmail({ link, minutes: RESET_TTL_MS / 60_000, name: user.name }) });
}
