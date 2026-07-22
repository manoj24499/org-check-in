import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/credentials";

const qrSchema = z.object({
  mode: z.literal("qr"),
  qrToken: z.string().min(1),
});

const pinSchema = z.object({
  mode: z.literal("pin"),
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(10),
});

const bodySchema = z.discriminatedUnion("mode", [qrSchema, pinSchema]);

// Simple in-memory rate limiter (per-process). Good enough for a single
// small kiosk device; swap for Upstash/Redis if you deploy multiple instances.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 20;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let user;

  if (parsed.data.mode === "qr") {
    user = await prisma.user.findUnique({
      where: { qrToken: parsed.data.qrToken },
    });
  } else {
    const candidate = await prisma.user.findUnique({
      where: { employeeCode: parsed.data.employeeCode },
    });
    if (candidate?.pinHash && (await verifyHash(parsed.data.pin, candidate.pinHash))) {
      user = candidate;
    } else {
      user = null;
    }
  }

  if (!user || user.role !== "EMPLOYEE" || !user.active) {
    return NextResponse.json(
      { error: "Not recognized. Please check your QR code or PIN and try again." },
      { status: 401 }
    );
  }

  const lastRecord = await prisma.attendance.findFirst({
    where: { userId: user.id },
    orderBy: { timestamp: "desc" },
  });

  const nextType = lastRecord?.type === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN";

  const record = await prisma.attendance.create({
    data: {
      userId: user.id,
      type: nextType,
      method: parsed.data.mode === "qr" ? "QR" : "PIN",
    },
  });

  return NextResponse.json({
    id: record.id,
    name: user.name,
    employeeCode: user.employeeCode,
    type: record.type,
    timestamp: record.timestamp,
  });
}
