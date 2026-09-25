import { prisma } from "@/lib/prisma";
import { normalizeOrgSlug } from "@/lib/orgSlug";
import type { OrgStatus } from "@prisma/client";

/**
 * Resolves an organization by slug for the read-only, pre-login lookups
 * (kiosk status/office-location) — a suspended organization's kiosk simply
 * shows no data, same as a nonexistent one, since neither of these surfaces
 * authenticates anyone or changes anything.
 *
 * `select: { id: true }` only — every current caller uses nothing else from
 * the row, and this is a lookup made on essentially every kiosk request.
 *
 * Callers decide their own "missing slug" default (e.g. the plain, org-less
 * /kiosk route falls back to `"default"`), not this function — a required
 * field (mobile/my-page login) and an optional query param with a
 * backward-compat default (kiosk) have genuinely different correct
 * behavior, so that decision stays visible at each call site.
 */
export async function resolveActiveOrgBySlug(rawSlug: string): Promise<{ id: string } | null> {
  const slug = normalizeOrgSlug(rawSlug);
  if (!slug) return null;
  return prisma.organization.findFirst({ where: { slug, status: "ACTIVE" }, select: { id: true } });
}

/**
 * Resolves an organization by slug for the surfaces that actually
 * authenticate someone (kiosk scan, mobile login, "My Page" employee login)
 * — unlike resolveActiveOrgBySlug above, this doesn't filter by status, so
 * the caller can tell "no such organization" apart from "this organization
 * exists but is suspended" and reject with whichever message that surface
 * supports (see each call site).
 */
export async function resolveOrgBySlug(rawSlug: string): Promise<{ id: string; status: OrgStatus } | null> {
  const slug = normalizeOrgSlug(rawSlug);
  if (!slug) return null;
  return prisma.organization.findFirst({ where: { slug }, select: { id: true, status: true } });
}
