import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyMobileToken, revokeRefreshToken } from "@/lib/mobileAuth";

const bodySchema = z.object({ refreshToken: z.string().min(1) });

/**
 * The actual fix for "logout doesn't revoke anything server-side" — until
 * now, the mobile app's logout() (src/store/authStore.ts) only ever cleared
 * local SecureStore; the refresh token itself stayed valid here for its
 * full 30-day life if it had been captured beforehand. This revokes that
 * one specific token's RefreshToken row — other devices/sessions for the
 * same employee are untouched (see User.tokenVersion, used by change-pin,
 * for the "kill every session at once" case).
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Verified so an attacker can't revoke an arbitrary jti by guessing one —
  // but deliberately not gated on tokenVersion/account-active/expiry the
  // way requireMobileUser is: an already-expired or already-superseded
  // refresh token should still be revoke-able (that's exactly the state a
  // logout call is likely to arrive in), and there's nothing sensitive
  // returned here either way.
  const payload = await verifyMobileToken(parsed.data.refreshToken, "refresh");
  if (payload?.jti) {
    await revokeRefreshToken(payload.jti);
  }

  // Always succeeds from the caller's perspective — the device's local
  // logout must proceed regardless of whether this call reached the server
  // at all (see authStore.ts's own comment on this).
  return NextResponse.json({ success: true });
}
