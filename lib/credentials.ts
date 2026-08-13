import crypto from "crypto";
import bcrypt from "bcryptjs";

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
