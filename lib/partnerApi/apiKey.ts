import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Same reasoning as lib/userToken.ts's hashToken: a high-entropy random value
// looked up by exact match, not a low-entropy secret needing a slow compare.
const KEY_PREFIX = "pk_live_";
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export interface CreatedApiKey {
  raw: string;
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
}

/** Issues a new partner-API key for one organization — only its hash is ever
 * persisted (see the schema comment on OrganizationApiKey). The raw value is
 * returned here and only here; there is no route that can ever recover it
 * again afterward, so the caller (the admin-facing create route) must show
 * it to the admin immediately and never log it. */
export async function createApiKey(organizationId: string, name: string): Promise<CreatedApiKey> {
  const raw = KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
  const record = await prisma.organizationApiKey.create({
    data: {
      organizationId,
      name,
      keyPrefix: raw.slice(0, DISPLAY_PREFIX_LENGTH),
      keyHash: hashKey(raw),
    },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });
  return { raw, ...record };
}

export async function listApiKeys(organizationId: string) {
  return prisma.organizationApiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
}

/** Scoped to the caller's own organization — an admin can never revoke
 * another company's key by guessing an id. */
export async function revokeApiKey(organizationId: string, id: string): Promise<boolean> {
  const result = await prisma.organizationApiKey.updateMany({
    where: { id, organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}

export { hashKey };
