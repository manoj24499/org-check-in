import crypto from "crypto";
import bcrypt from "bcryptjs";
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
 */
export async function allocateNextEmployeeCode(): Promise<string> {
  const [settings, maxActive, maxArchived] = await Promise.all([
    prisma.appSettings.findFirst(),
    prisma.user.findFirst({
      where: { employeeCode: { startsWith: "EMP" } },
      orderBy: { employeeCode: "desc" },
      select: { employeeCode: true },
    }),
    prisma.deletedEmployeeArchive.findFirst({
      where: { employeeCode: { startsWith: "EMP" } },
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

  const settingsId = settings?.id ?? (await prisma.appSettings.create({ data: {} })).id;

  // Only ever raises the counter, never lowers it — safe even if another
  // caller's identical check races this one, since both converge on the
  // same non-decreasing floor.
  if (floor > 0) {
    await prisma.appSettings.updateMany({
      where: { id: settingsId, lastEmployeeCodeNumber: { lt: floor } },
      data: { lastEmployeeCodeNumber: floor },
    });
  }

  const updated = await prisma.appSettings.update({
    where: { id: settingsId },
    data: { lastEmployeeCodeNumber: { increment: 1 } },
    select: { lastEmployeeCodeNumber: true },
  });

  return nextEmployeeCode("EMP", updated.lastEmployeeCodeNumber - 1);
}
