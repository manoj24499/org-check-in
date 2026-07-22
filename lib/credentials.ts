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

/** Generates a random opaque token to embed in an employee's QR code */
export function generateQrToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function hash(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}

export async function verifyHash(value: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(value, hashed);
}

/** Builds the next sequential employee code, e.g. EMP001, EMP002... */
export function nextEmployeeCode(prefix: "EMP" | "ADM", currentMax: number): string {
  return `${prefix}${String(currentMax + 1).padStart(3, "0")}`;
}
