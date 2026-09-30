import { prisma } from "@/lib/prisma";
import { hashKey } from "@/lib/partnerApi/apiKey";

export type PartnerAuthResult =
  | { ok: true; organizationId: string; apiKeyId: string }
  | { ok: false };

/** Resolves the calling organization from an `Authorization: Bearer <key>`
 * header — the one credential type this partner API accepts (see the
 * response doc's Authentication panel: no OAuth 2.0 anywhere in this app).
 * A revoked key fails the same as an unknown one; there's no distinct error
 * for "revoked" vs "never existed" so a caller can't use the difference to
 * enumerate keys. */
export async function resolvePartnerAuth(req: Request): Promise<PartnerAuthResult> {
  const header = req.headers.get("authorization");
  const match = header ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  const raw = match?.[1]?.trim();
  if (!raw) return { ok: false };

  const key = await prisma.organizationApiKey.findUnique({ where: { keyHash: hashKey(raw) } });
  if (!key || key.revokedAt) return { ok: false };

  // Best-effort visibility for the admin's key-management panel — must
  // never block or fail the actual request if it errors.
  prisma.organizationApiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => console.error("[partner-api] Failed to record key usage:", err));

  return { ok: true, organizationId: key.organizationId, apiKeyId: key.id };
}
