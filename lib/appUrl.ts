/**
 * The one place an absolute/emailed link (e.g. an activation link) is built
 * from — reuses NEXTAUTH_URL, already documented in .env.example as "the
 * deployed app's own base URL," rather than introducing a second env var
 * for the same thing. Deliberately never built from a request's Host
 * header, which a caller can set to anything.
 */
export const APP_BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
