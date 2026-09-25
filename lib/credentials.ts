import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Generates a random numeric PIN, e.g. "483920" */
export function generatePin(length = 6): string {
  const digits = "0123456789";
  let pin = "";
  for (let i = 0; i < length; i++) {
    pin += digits[crypto.randomInt(0, digits.length)];
  }
  return pin;
}

// Cost 12, not the more common 10 — every caller of this pair hashes a
// 4-6 digit numeric PIN (at most 1,000,000 possible values), not a
// full-entropy password. Bcrypt embeds its cost factor in the hash string
// itself, so raising this doesn't invalidate any already-stored pinHash —
// existing ones keep verifying at whatever cost they were created with;
// only newly-set/changed PINs get the stronger cost going forward.
const PIN_HASH_COST = 12;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_HASH_COST);
}

export async function verifyPin(pin: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(pin, hashed);
}

// Should essentially never loop — 1,000,000 possible 6-digit PINs against a
// realistic active-employee count — but caps out rather than looping
// forever in the pathological case, falling back to whatever the last
// attempt generated (still logged, so it's visible if it ever actually
// happens).
const MAX_GENERATE_ATTEMPTS = 5;

/**
 * generatePin() + a collision check against every other active employee's
 * PIN, retried a few times on the (extremely unlikely) chance of a random
 * collision — used by the admin create/regenerate-pin flows so a
 * system-generated PIN can't hand two employees the same one either, same
 * reasoning as isPinTakenByAnotherEmployee below.
 */
export async function generateUniquePin(
  organizationId: string,
  excludeUserId?: string,
  length = 6,
): Promise<string> {
  let pin = generatePin(length);
  for (let attempt = 1; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    if (!(await isPinTakenByAnotherEmployee(pin, organizationId, excludeUserId))) return pin;
    console.warn(`[generateUniquePin] Collision on attempt ${attempt}, regenerating.`);
    pin = generatePin(length);
  }
  return pin;
}

/**
 * True if the given plaintext PIN matches any OTHER active employee's
 * currently-stored PIN, *within the same organization* — employeeCode is
 * only unique per-organization now, so a PIN shared with an unrelated
 * employee at a different company is not a risk worth scanning for.
 * Verification itself (verifyPin above) is already correctly scoped
 * per-employee via employeeCode — a shared PIN can never let one employee's
 * login be mistaken for another's — but employeeCode isn't secret (often
 * sequential, visible in the app itself), so two employees at the *same*
 * organization *knowingly* sharing a PIN is a real impersonation risk:
 * either one can deliberately log in as the other. This is the guard
 * against that, called wherever a PIN is set (self-service change-pin, and
 * the admin create/regenerate flows for defense in depth) — not a fix to
 * the verification logic, which was never the problem.
 *
 * bcrypt hashes have no reversible/indexable lookup, so this is a linear
 * scan comparing against every other active employee's hash *in this
 * organization*, with an early exit on the first match. Fine at this app's
 * per-organization employee-count scale; it would need a separate
 * keyed-hash index (not a bcrypt rework) to stay fast
 * into the thousands.
 */
export async function isPinTakenByAnotherEmployee(
  pin: string,
  organizationId: string,
  excludeUserId?: string,
): Promise<boolean> {
  const others = await prisma.user.findMany({
    where: {
      organizationId,
      role: "EMPLOYEE",
      active: true,
      pinHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { pinHash: true },
  });
  for (const other of others) {
    if (other.pinHash && (await bcrypt.compare(pin, other.pinHash))) {
      return true;
    }
  }
  return false;
}

/** Builds the next sequential employee code, e.g. EMP001, EMP002... */
export function nextEmployeeCode(prefix: "EMP" | "ADM", currentMax: number): string {
  return `${prefix}${String(currentMax + 1).padStart(3, "0")}`;
}

/**
 * Atomically allocates and returns the next "EMP..." code, backed by a
 * persistent counter (AppSettings.lastEmployeeCodeNumber) rather than
 * MAX(User.employeeCode) or COUNT(*) over currently-existing rows.
 *
 * Why this exists: an employee's code frees up once
 * lib/employeeCleanup.ts hard-deletes them (7 days after deactivation), so
 * MAX()/COUNT()-based approaches silently *reuse* a deleted employee's code
 * for the next new hire. That's more than a cosmetic collision —
 * lib/faceVerify.ts identifies people to the face-verification service by
 * employeeCode alone, and that service is never told when an employee is
 * deleted, so a reissued code can inherit a stranger's stale face
 * enrollment. This counter only ever moves forward, so a code is never
 * handed out twice.
 *
 * Self-healing: also folds in the actual highest code currently in use
 * (across live Users and DeletedEmployeeArchive) on every call, so it
 * recovers correctly even on its very first call (counter still at the
 * schema default of 0, with existing employees already above that) or
 * after any manual DB intervention — it can only ratchet the floor up,
 * never down.
 *
 * The final increment (`{ increment: 1 }`) is a single atomic UPDATE at
 * the database level — concurrent callers (e.g. two admins creating
 * employees at once, or a bulk import racing a single create) serialize on
 * that row and can never receive the same value.
 *
 * Scoped per organization — the counter lives on that organization's own
 * AppSettings row (organizationId is @unique there), so every organization's
 * employee codes independently start from EMP001.
 */
export async function allocateNextEmployeeCode(organizationId: string): Promise<string> {
  const [settings, maxActive, maxArchived] = await Promise.all([
    prisma.appSettings.findUnique({ where: { organizationId } }),
    prisma.user.findFirst({
      where: { organizationId, employeeCode: { startsWith: "EMP" } },
      orderBy: { employeeCode: "desc" },
      select: { employeeCode: true },
    }),
    prisma.deletedEmployeeArchive.findFirst({
      where: { organizationId, employeeCode: { startsWith: "EMP" } },
      orderBy: { employeeCode: "desc" },
      select: { employeeCode: true },
    }),
  ]);

  const parseNumber = (code: string | undefined) =>
    code ? parseInt(code.replace("EMP", ""), 10) || 0 : 0;
  const floor = Math.max(
    parseNumber(maxActive?.employeeCode),
    parseNumber(maxArchived?.employeeCode),
    settings?.lastEmployeeCodeNumber ?? 0,
  );

  if (!settings) {
    // Two concurrent callers for the same brand-new organization (e.g. two
    // rows of a bulk import) can both see `settings === null` here — unlike
    // the analogous OfficeLocation race (fixed via upsert in
    // app/api/admin/office-location/route.ts), this create can't use upsert
    // since there's no data to update with yet. Whichever caller loses the
    // race just hits the unique constraint it was trying to avoid; that's
    // fine, since it means the row it wanted now exists either way.
    try {
      await prisma.appSettings.create({ data: { organizationId } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }

  // Only ever raises the counter, never lowers it — safe even if another
  // caller's identical check races this one, since both converge on the
  // same non-decreasing floor.
  if (floor > 0) {
    await prisma.appSettings.updateMany({
      where: { organizationId, lastEmployeeCodeNumber: { lt: floor } },
      data: { lastEmployeeCodeNumber: floor },
    });
  }

  const updated = await prisma.appSettings.update({
    where: { organizationId },
    data: { lastEmployeeCodeNumber: { increment: 1 } },
    select: { lastEmployeeCodeNumber: true },
  });

  return nextEmployeeCode("EMP", updated.lastEmployeeCodeNumber - 1);
}
