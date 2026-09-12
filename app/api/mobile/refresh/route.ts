import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  signAccessToken,
  issueRefreshToken,
  verifyMobileToken,
  tokenVersionMatches,
  verifyRefreshTokenRecord,
  revokeRefreshToken,
} from "@/lib/mobileAuth";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const payload = await verifyMobileToken(parsed.data.refreshToken, "refresh");
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired session. Please log in again." }, { status: 401 });
  }

  // The JWT's own signature/expiry only proves it was validly issued, not
  // that it hasn't since been revoked (an explicit logout — see
  // /api/mobile/logout) or already superseded by an earlier rotation of the
  // same token. This is the real server-side revocation check; tokenVersion
  // below only ever covers "kill every session at once" (a PIN change), not
  // one specific session.
  const jti = payload.jti;
  if (!jti || !(await verifyRefreshTokenRecord(jti))) {
    return NextResponse.json({ error: "Invalid or expired session. Please log in again." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json({ error: "Account is no longer active." }, { status: 401 });
  }
  // A superseded refresh token (the PIN was changed since this one was
  // issued — see the schema comment on User.tokenVersion) is rejected the
  // same way an expired one is: the client's only path forward from here is
  // a real login.
  if (!tokenVersionMatches(payload, user)) {
    return NextResponse.json({ error: "Invalid or expired session. Please log in again." }, { status: 401 });
  }

  // Rotate both tokens on every refresh — the old refresh token is revoked
  // the instant it's exchanged, so a copy of it (captured before this
  // rotation, e.g. from device storage) can't also be replayed afterward.
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user),
    issueRefreshToken(user),
  ]);
  await revokeRefreshToken(jti);

  return NextResponse.json({ accessToken, refreshToken });
}
