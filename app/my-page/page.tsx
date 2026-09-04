import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MyPageWorkspace from "@/components/MyPageWorkspace";
import { computeWorkedMs } from "@/lib/attendanceHours";
import { getCalendarSpecialDays } from "@/lib/timeOff";
import { startOfISTMonth, istTimeOfDay } from "@/lib/istTime";

export const dynamic = "force-dynamic";

const WORK_MODE_LABEL: Record<string, string> = {
  OFFICE: "Office",
  WFH: "WFH",
  FIELD: "Field",
};

function formatDuration(ms: number) {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export default async function MyPage() {
  const session = await auth();
  if (!session) return null;

  const [records, me, specialDays] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: session.user.id },
      orderBy: { timestamp: "desc" },
      take: 1000,
      include: { pauses: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { workMode: true },
    }),
    getCalendarSpecialDays(session.user.id),
  ]);

  const last = records[0];
  const isIn = last?.type === "CHECK_IN";

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthStart = startOfISTMonth(now);

  // Pair each check-in with the next check-out (chronologically) to total hours worked in the last 7 days.
  let weeklyHours = 0;
  let openCheckIn: (typeof records)[number] | null = null;
  for (const r of [...records].reverse()) {
    if (r.type === "CHECK_IN") {
      openCheckIn = r;
    } else if (r.type === "CHECK_OUT" && openCheckIn) {
      if (r.timestamp >= weekAgo) {
        weeklyHours +=
          computeWorkedMs(openCheckIn.timestamp, r.timestamp, openCheckIn.pauses) /
          (1000 * 60 * 60);
      }
      openCheckIn = null;
    }
  }

  const monthRecords = records.filter((r) => r.timestamp >= monthStart);

  // Average check-in time of day this month, e.g. "09:06".
  const monthCheckIns = monthRecords.filter((r) => r.type === "CHECK_IN");
  const lateThisMonth = monthCheckIns.filter((r) => r.lateMinutes !== null && r.lateMinutes > 0).length;
  let avgStart = "—";
  if (monthCheckIns.length > 0) {
    // IST wall-clock time of day, not the server's own (UTC in production) —
    // otherwise a 9:05am IST check-in averages in as "03:35".
    const avgMinutes =
      monthCheckIns.reduce((sum, r) => {
        const t = istTimeOfDay(r.timestamp);
        return sum + t.hours * 60 + t.minutes;
      }, 0) / monthCheckIns.length;
    const h = Math.floor(avgMinutes / 60);
    const m = Math.round(avgMinutes % 60);
    avgStart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const serializedRecords = records.map((r) => ({
    id: r.id,
    type: r.type,
    method: r.method,
    timestamp: r.timestamp.toISOString(),
    hasPhoto: r.hasPhoto,
    pauses: r.pauses.map((p) => ({
      pausedAt: p.pausedAt.toISOString(),
      resumedAt: p.resumedAt?.toISOString() ?? null,
      reason: p.timedPermissionId ? ("permission" as const) : ("geofence" as const),
    })),
  }));

  return (
    <div className="flex flex-col gap-5 px-5 sm:px-7 py-6 sm:py-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            {session.user.employeeCode}
            {me?.workMode ? ` · ${WORK_MODE_LABEL[me.workMode] ?? me.workMode}` : ""}
          </span>
          <h1 className="mt-1 text-[28px] sm:text-[30px] font-medium tracking-[-0.025em] text-foreground">
            {session.user.name}
          </h1>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary/[0.08] px-3.5 py-2.5 w-fit">
          <span
            className={`w-[7px] h-[7px] rounded-full ${isIn ? "bg-primary animate-pulse" : "bg-muted"}`}
          />
          <span className="text-sm font-medium text-primary-dark">
            {last
              ? isIn
                ? `Checked in since ${last.timestamp.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · ${formatDuration(now.getTime() - last.timestamp.getTime())}`
                : "Checked out"
              : "No activity yet"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-lg border border-border bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
            Hours (7 days)
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {weeklyHours.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
            Late this month
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {lateThisMonth}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-[17px] shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-muted">
            Avg. start
          </p>
          <p className="text-4xl font-medium tracking-[-0.03em] mt-1.5 tabular-nums text-foreground">
            {avgStart}
          </p>
        </div>
      </div>

      <MyPageWorkspace records={serializedRecords} specialDays={specialDays} />
    </div>
  );
}
