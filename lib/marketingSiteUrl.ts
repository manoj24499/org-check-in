/**
 * The Inzivo marketing site's own base URL — where the browser is sent back
 * to for every step of the paid-signup journey except the final admin
 * login (the dummy-payment simulator's redirect, and the post-payment
 * status/complete page all live there now, not in this app — see
 * lib/cors.ts's own comment on why). Same "hardcoded constant, override via
 * env for local dev" convention as lib/appUrl.ts.
 */
export const MARKETING_SITE_URL = process.env.MARKETING_SITE_URL ?? "http://localhost:3001";
