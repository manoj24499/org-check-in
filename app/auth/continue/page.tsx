import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/safeCallbackUrl";
import { isFreshSignIn } from "@/lib/freshSignIn";
import ContinueClient from "./ContinueClient";

export const metadata: Metadata = { title: "Signing you in…", robots: "noindex, nofollow" };

/**
 * The landing point for a sign-in that happened on a *different origin* (the
 * marketing site's own /signin form). components/TabSecurity.tsx signs a tab
 * out unless that tab carries a `tab_auth` marker in its own sessionStorage —
 * which exists to stop a stale cookie silently logging a new tab in — but
 * sessionStorage is per-origin, so the marketing site can't set it for this
 * app, and the redirect straight to /admin/dashboard was bouncing admins back
 * to /login.
 *
 * This page sets the marker on the app's behalf, but only when the session was
 * created moments ago (see `signedInAt` in lib/auth.config.ts): a fresh
 * sign-in earns the marker, while an old cookie someone merely re-opens in a
 * new tab still has to sign in again, exactly as before.
 */
export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await auth();
  if (!session?.user || !isFreshSignIn(session)) redirect("/login");

  const fallback = session.user.role === "EMPLOYEE" ? "/my-page" : "/admin/dashboard";
  return <ContinueClient next={safeCallbackUrl(next, fallback)} />;
}
