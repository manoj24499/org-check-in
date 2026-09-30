import { NextResponse } from "next/server";

/**
 * The Inzivo marketing site (a separate app/domain — see D:\projects\
 * inzivo-website) now owns the entire "pick a plan, register, pay" journey;
 * this app is only ever reached directly for the final admin login. That
 * means the browser calls a handful of this app's public JSON endpoints
 * cross-origin from the marketing site's own pages, which needs an explicit
 * CORS allowance — browsers block cross-origin fetches by default.
 *
 * Deliberately no `Access-Control-Allow-Credentials` on any of this — every
 * endpoint this is used on (signup checkout, slug check, signup status,
 * activate/resend) is public-by-design and takes no session cookie, so
 * there's nothing here that needs credentialed CORS's extra exposure.
 */
const MARKETING_SITE_ORIGIN = process.env.MARKETING_SITE_URL ?? "http://localhost:3001";

export function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": MARKETING_SITE_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Wraps an existing NextResponse, adding the CORS headers above. */
export function withCors(res: NextResponse): NextResponse {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
  return res;
}

/** The OPTIONS preflight every browser sends before a cross-origin POST
 * with a JSON body — respond 204 with the same allowance. */
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * The one exception to "no credentials" above: the marketing site's own
 * /signin form (see that repo's app/signin) authenticates directly against
 * this app's NextAuth endpoints (/api/auth/csrf, /api/auth/callback/
 * admin-login) from the browser, which needs the CSRF and session cookies
 * to actually flow cross-origin. Credentialed CORS forbids a wildcard
 * origin — it names this one specific origin, never "*" — and the CSRF
 * cookie itself is set with SameSite=None (see lib/auth.config.ts) so it
 * survives the round trip; the session cookie doesn't need that (it's only
 * ever read back once the browser has actually navigated to this app's own
 * origin, a same-origin request by then regardless of how sign-in started).
 */
export function corsHeadersCredentialed(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": MARKETING_SITE_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Return-Redirect",
    Vary: "Origin",
  };
}

export function withCorsCredentialed(res: Response): Response {
  const headers = corsHeadersCredentialed();
  for (const [key, value] of Object.entries(headers)) {
    res.headers.set(key, value);
  }
  return res;
}

export function corsPreflightCredentialed(): Response {
  return new Response(null, { status: 204, headers: corsHeadersCredentialed() });
}
