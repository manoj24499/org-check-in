import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Best-effort only — this service already fails open everywhere it's
// actually used (see lib/faceVerify.ts's own comment), so its reachability
// is reported here for visibility but never affects the overall `status`
// below. A short timeout so a hung/unreachable face-verify host can't make
// this whole health check slow.
async function checkFaceVerify(): Promise<"ok" | "unreachable" | "not_configured"> {
  const baseUrl = process.env.FACE_VERIFY_URL;
  if (!baseUrl) return "not_configured";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(baseUrl, { signal: controller.signal });
    return res.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Unauthenticated health check for uptime monitoring / load balancers — no
 * sensitive data returned, just whether this instance can actually do its
 * job right now. Deliberately checks a LIVE query, not just that
 * DATABASE_URL is set: this app's own history includes a real incident
 * (2026-09-03) where the env var was present but pointed at a broken
 * value, and only a live query ever surfaced it — instrumentation.ts's
 * boot-time check only catches the var being *missing*, not wrong.
 */
export async function GET() {
  const [dbResult, faceVerifyResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkFaceVerify(),
  ]);

  const databaseOk = dbResult.status === "fulfilled";
  if (!databaseOk) {
    console.error("[GET /api/health] Database check failed:", dbResult.reason);
  }

  return NextResponse.json(
    {
      status: databaseOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseOk ? "ok" : "error",
        faceVerification: faceVerifyResult.status === "fulfilled" ? faceVerifyResult.value : "unreachable",
      },
    },
    { status: databaseOk ? 200 : 503 },
  );
}
