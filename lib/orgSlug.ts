// Validates a proposed Organization.slug at creation time (see
// app/api/register/route.ts and its check-slug companion). Deliberately
// stricter than the "trim + lowercase" normalization every *matching* site
// (kiosk, mobile login, my-page login) already does on an existing slug —
// this is the one place a new slug is actually chosen, so it's worth
// enforcing a clean, URL-safe shape (it doubles as a kiosk URL segment) up
// front rather than accepting anything and dealing with it later.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 40;

export function normalizeOrgSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidOrgSlug(slug: string): boolean {
  return slug.length >= MIN_LENGTH && slug.length <= MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/** A URL-safe slug suggestion from an organization's display name — not
 * guaranteed unique or even non-empty (e.g. an all-symbols name); the
 * caller still validates/checks availability before using it. */
export function suggestOrgSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH);
}
