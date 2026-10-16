import { NextRequest, NextResponse } from "next/server";
import { performance } from "node:perf_hooks";
import { prisma } from "@/lib/prisma";
import { hashPin, verifyPin } from "@/lib/credentials";
import { checkFaceVerifyHealth } from "@/lib/faceVerify";
import { checkLoadtestAccess, runLimited } from "@/lib/loadtestGuard";

export const dynamic = "force-dynamic";

/**
 * Synthetic endpoints for load-testing tools (k6, JMeter, Artillery, hey, ...). They touch no real data and are
 * switched off unless LOADTEST_SECRET is set (see lib/loadtestGuard.ts). Send the secret as `x-loadtest-secret`.
 *
 *   GET /api/loadtest/ping            the app and the network only, no database. The ceiling for requests per second.
 *   GET /api/loadtest/db?queries=1    one to five trivial queries through the database connection pool.
 *   GET /api/loadtest/cpu?rounds=1    one to three PIN-style checks (bcrypt, cost 12), the work every login and
 *                                     check-in does, which is the main CPU cost of the real app.
 *   GET /api/loadtest/face            asks the face service whether it is up (not a real face match).
 *
 * `db`, `cpu` and `face` refuse with 503 once too many are running at once (LOADTEST_MAX_INFLIGHT, default
 * "db:40,cpu:8,face:8"), so a test can find the limit without taking the whole server down. Every answer has a
 * Server-Timing header and an "ms" field with the time the server itself spent, apart from network time.
 */

type Ctx = { params: Promise<{ probe: string }> };

const PROBES = ["ping", "db", "cpu", "face"] as const;
type Probe = (typeof PROBES)[number];

function limits(): Record<"db" | "cpu" | "face", number> {
  const out = { db: 40, cpu: 8, face: 8 };
  for (const part of (process.env.LOADTEST_MAX_INFLIGHT ?? "").split(",")) {
    const [name, value] = part.split(":").map((s) => s.trim());
    const n = Number(value);
    if ((name === "db" || name === "cpu" || name === "face") && Number.isInteger(n) && n > 0) out[name] = n;
  }
  return out;
}

function intParam(req: NextRequest, name: string, fallback: number, max: number): number {
  const n = Number.parseInt(req.nextUrl.searchParams.get(name) ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : fallback;
}

function reply(body: Record<string, unknown>, started: number, status = 200) {
  const ms = Math.round((performance.now() - started) * 10) / 10;
  return NextResponse.json(
    { ...body, ms },
    { status, headers: { "Cache-Control": "no-store", "Server-Timing": `app;dur=${ms}` } },
  );
}

// Hashed once, the first time the cpu probe is called, before that call's timer starts.
let sampleHash: Promise<string> | null = null;
const getSampleHash = () => (sampleHash ??= hashPin("000000"));

async function runProbe(probe: Exclude<Probe, "ping">, req: NextRequest) {
  switch (probe) {
    case "db": {
      const queries = intParam(req, "queries", 1, 5);
      for (let i = 0; i < queries; i++) await prisma.$queryRaw`SELECT 1`;
      return { queries };
    }
    case "cpu": {
      const rounds = intParam(req, "rounds", 1, 3);
      const hash = await getSampleHash();
      for (let i = 0; i < rounds; i++) await verifyPin("000000", hash);
      return { rounds };
    }
    case "face": {
      return { faceService: await checkFaceVerifyHealth() };
    }
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = checkLoadtestAccess(req);
  if (denied) return denied;

  const { probe } = await ctx.params;
  if (!(PROBES as readonly string[]).includes(probe)) {
    return NextResponse.json({ error: "Unknown probe.", probes: PROBES }, { status: 404 });
  }

  const started = performance.now();
  if (probe === "ping") {
    return reply({ ok: true, probe, uptimeSeconds: Math.round(process.uptime()), pid: process.pid }, started);
  }

  try {
    if (probe === "cpu") await getSampleHash();
    const result = await runLimited(probe, limits()[probe as "db" | "cpu" | "face"], async () => {
      // time only the work itself, not the wait for the in-flight slot
      const work = performance.now();
      const detail = await runProbe(probe as "db" | "cpu" | "face", req);
      return { detail, workMs: performance.now() - work };
    });
    if (result === "busy") {
      const res = reply({ ok: false, probe, error: "Too many of this probe running at once." }, started, 503);
      res.headers.set("Retry-After", "1");
      return res;
    }
    return reply({ ok: true, probe, ...result.detail, workMs: Math.round(result.workMs * 10) / 10 }, started);
  } catch (err) {
    console.error(`[GET /api/loadtest/${probe}] failed:`, err);
    return reply({ ok: false, probe, error: "Probe failed." }, started, 500);
  }
}
