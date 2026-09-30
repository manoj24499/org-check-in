import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { revokeApiKey } from "@/lib/partnerApi/apiKey";

/** Revokes a partner-API key — scoped to the caller's own organization, so
 * an admin can never revoke (or even discover the existence of) another
 * company's key by guessing an id. Never deletes the row (see the schema
 * comment on OrganizationApiKey) — same audit-trail precedent as
 * RefreshToken. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const revoked = await revokeApiKey(admin.organizationId, id);
  if (!revoked) {
    return NextResponse.json({ error: "Key not found, or already revoked." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
