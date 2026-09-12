import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPin } from "@/lib/credentials";
import { getClientIp, isRateLimited, isPinGuessLimited } from "@/lib/rateLimit";
import { signAccessToken, issueRefreshToken } from "@/lib/mobileAuth";

const bodySchema = z.object({
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(10),
});

// This route previously had no top-level catch at all — an unexpected
// failure (e.g. the DB being briefly unreachable, per the 2026-09-03
// incident) bubbled all the way up to a bare 500 with no body. Logging
// server-side and returning a clean JSON error (never the real error
// detail, matching every other route's error handling in this app) fixes
// both the debuggability and the caller-facing experience.
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    console.error("[POST /api/mobile/login] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

async function handlePost(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`mobile-login:${ip}`, 60_000, 10)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The IP-based limit above only slows down a single-source attacker — it
  // does nothing against one who spreads guesses across many IPs/proxies, or
  // who switches to a different PIN-checking surface (the kiosk, or the "My
  // Page" web login) to get a fresh budget. isPinGuessLimited is shared
  // across all of them, keyed only on employeeCode, so guesses against one
  // specific account are capped no matter which entry point or how many
  // source IPs an attacker uses.
  if (await isPinGuessLimited(parsed.data.employeeCode)) {
    return NextResponse.json(
      { error: "Too many attempts for this employee code. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { employeeCode: parsed.data.employeeCode },
  });

  const valid =
    !!user?.pinHash && user.role === "EMPLOYEE" && user.active &&
    (await verifyPin(parsed.data.pin, user.pinHash));

  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid employee code or PIN." }, { status: 401 });
  }

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    issueRefreshToken(user),
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      employeeCode: user.employeeCode,
      name: user.name,
      email: user.email,
      role: user.role,
      workMode: user.workMode,
      // Lets the client decide whether to show the mandatory "take a
      // selfie" enrollment screen (see /api/mobile/me/face-enroll) right
      // after login — false means this employee has no reference face
      // enrolled with the face-verification service yet.
      faceVerificationEnabled: user.faceVerificationEnabled,
      // Admin escape hatch for that same gate — see the schema comment on
      // User.faceVerificationExempt.
      faceVerificationExempt: user.faceVerificationExempt,
    },
  });
}
