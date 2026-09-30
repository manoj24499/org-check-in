import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { withCorsCredentialed, corsPreflightCredentialed } from "@/lib/cors";

// Credentialed CORS on the whole NextAuth surface — the marketing site's
// own /signin form calls /api/auth/csrf and /api/auth/callback/admin-login
// directly from the browser (see lib/cors.ts's own comment on why this is
// the one credentialed exception in this app).
export function OPTIONS() {
  return corsPreflightCredentialed();
}

export async function GET(req: NextRequest) {
  return withCorsCredentialed(await handlers.GET(req));
}

export async function POST(req: NextRequest) {
  return withCorsCredentialed(await handlers.POST(req));
}
