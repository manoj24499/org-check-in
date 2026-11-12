import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AttendanceEventKind = "AUTO_CHECKOUT_WARNING" | "AUTO_CHECKOUT" | "MANUAL_ENTRY" | "PUSH_SENT";

// The table only exists once its migration has been applied. If it's missing, stop trying for a while instead
// of failing (and logging an error) on every check-in, push and cron run.
let pausedUntil = 0;

/**
 * Records something the system (or an admin) did to someone's attendance, for the monitoring site. Best-effort:
 * never throws, never blocks, safe to call without awaiting — the thing it describes must never depend on it.
 */
export async function logAttendanceEvent(event: {
  userId: string;
  organizationId?: string | null;
  attendanceId?: string | null;
  kind: AttendanceEventKind;
  actor: "SYSTEM" | "ADMIN";
  summary: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (Date.now() < pausedUntil) return;
  try {
    await prisma.attendanceEvent.create({
      data: {
        userId: event.userId,
        organizationId: event.organizationId ?? null,
        attendanceId: event.attendanceId ?? null,
        kind: event.kind,
        actor: event.actor,
        summary: event.summary.slice(0, 600),
        detail: (event.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022")) {
      pausedUntil = Date.now() + 10 * 60_000;
      console.warn("[attendanceEvents] AttendanceEvent table not found — event logging paused. Apply the pending migration.");
      return;
    }
    console.error("[attendanceEvents] Could not write the event:", err instanceof Error ? err.message : err);
  }
}
