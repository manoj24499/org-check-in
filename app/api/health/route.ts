import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkFaceVerifyHealth } from "@/lib/faceVerify";

export const dynamic = "force-dynamic";

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
    checkFaceVerifyHealth(),
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
