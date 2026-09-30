import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/requireAdmin";
import { createApiKey, listApiKeys } from "@/lib/partnerApi/apiKey";

/** Every partner-API key for the caller's own organization — for the
 * Settings page's key-management panel. Never returns a raw key value;
 * only the create response below ever does, and only once. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await listApiKeys(admin.organizationId);
  return NextResponse.json({ keys });
}

const bodySchema = z.object({ name: z.string().trim().min(1).max(120) });

/** Issues a new partner-API key. The raw value is returned exactly once, in
 * this response — never logged, never stored, and never recoverable again
 * afterward (see lib/partnerApi/apiKey.ts). */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name for this key." }, { status: 400 });
  }

  const created = await createApiKey(admin.organizationId, parsed.data.name);
  return NextResponse.json({ key: created });
}
