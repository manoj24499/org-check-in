import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmployeeCheckIn from "@/components/EmployeeCheckIn";
import RequestButtons from "@/components/mypage/RequestButtons";
import { InsightsRow, LeavePanel, type InsightsData, type Tone, type UpNext } from "@/components/mypage/MyPageCards";
import MyPageTabs, { type ActivityItem, type CalCell, type RequestItem } from "@/components/mypage/MyPageTabs";
import { computeWorkedMs } from "@/lib/attendanceHours";
import { getCalendarSpecialDays, getLeaveBalances } from "@/lib/timeOff";
import { istDateKey, istTimeOfDay } from "@/lib/istTime";
import { istGreeting } from "@/lib/greeting";

export const dynamic = "force-dynamic";

const WORK_MODE_LABEL: Record<string, string> = { OFFICE: "Office", WFH: "WFH", FIELD: "Field", HYBRID: "Hybrid" };
const LEAVE_LABEL: Record<string, string> = { CASUAL: "Casual", SICK: "Sick", EARNED: "Earned" };
const LEAVE_COLOR: Record<string, string> = { CASUAL: "#1a1512", SICK: "#ef6c00", EARNED: "#2e6f52" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 3600_000;

/**
 * Everything on this page except the attendance records is supporting detail (leave balances, request lists, the
 * calendar's holidays). If one of those queries fails (a database hiccup, a busy connection pool), the page should
 * still open with that part empty, not collapse into "Something went wrong". The failure is logged for diagnosis.
 */
async function safe<T>(label: string, work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (err) {
    console.error(`[my-page] ${label} failed:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

const IST = { timeZone: "Asia/Kolkata" } as const;
const fmtTime = (d: Date) => d.toLocaleTimeString("en-IN", { ...IST, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDay = (d: Date) => d.toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short" });
const fmtWeekday = (d: Date) => d.toLocaleDateString("en-IN", { ...IST, weekday: "short" });
const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
/** A date-only column (stored as UTC midnight) as "27 Nov". */
const fmtDateOnly = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const keyToDate = (k: string) => new Date(`${k}T00:00:00Z`);
const addDays = (k: string, n: number) => new Date(keyToDate(k).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const statusTone = (s: string): { label: string; tone: Tone } =>
  s === "APPROVED" ? { label: "Approved", tone: "ok" } : s === "REJECTED" ? { label: "Rejected", tone: "bad" } : s === "CANCELLED" ? { label: "Cancelled", tone: "plain" } : { label: "Pending", tone: "wait" };

export default async function MyPage() {
  const session = await auth();
  // The organizationId check matters on its own, not just the session check: a session issued before
  // organizationId existed on the JWT would otherwise pass `undefined` into the queries below, and Prisma treats an
  // undefined filter as "no filter", which would silently return every organization's data.
  if (!session || !session.user.organizationId) return null;
  const userId = session.user.id;
  const orgId = session.user.organizationId;

  const now = new Date();
  const todayKey = istDateKey(now);
  const monthStartKey = `${todayKey.slice(0, 8)}01`;
  const monthStart = new Date(keyToDate(monthStartKey).getTime() - 5.5 * 3600_000);

  const [records, me, specialDays, balances, leaveReqs, permissions, overtime, manual] = await Promise.all([
    // Explicit `select`: the page never needs photo bytes, only `hasPhoto`.
    prisma.attendance.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: 1000,
      select: {
        id: true, type: true, method: true, timestamp: true, lateMinutes: true,
        pauses: { select: { pausedAt: true, resumedAt: true, timedPermissionId: true } },
        workSegments: { select: { mode: true, heading: true, startedAt: true, endedAt: true } },
      },
    }),
    safe("user", prisma.user.findUnique({ where: { id: userId }, select: { workMode: true, name: true } }), null),
    safe("calendar days", getCalendarSpecialDays(userId, orgId), {}),
    safe("leave balances", getLeaveBalances(userId, orgId), []),
    safe("leave requests", prisma.timeOffRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 }), []),
    safe(
      "permissions",
      prisma.timedPermission.findMany({
        where: { attendance: { userId } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { startTime: true, endTime: true, approvalStatus: true, createdAt: true },
      }),
      [],
    ),
    safe(
      "overtime",
      prisma.overtimeRequest.findMany({
        where: { attendance: { userId } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { estimatedEndAt: true, reason: true, status: true, createdAt: true },
      }),
      [],
    ),
    safe("manual entries", prisma.manualEntryRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }), []),
  ]);

  const chrono = [...records].reverse();
  const firstName = (session.user.name ?? "").trim().split(/\s+/)[0] || "there";

  // ---- pair each check-in with the next check-out ----
  const hoursByDay = new Map<string, number>();
  const durationForCheckOut = new Map<string, number>();
  const firstInOfDay = new Map<string, (typeof records)[number]>();
  // The last check-out of each day (keyed by the day of the check-in it closes), for the calendar.
  const lastOutOfDay = new Map<string, Date>();
  let weeklyMs = 0;
  let open: (typeof records)[number] | null = null;
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  for (const r of chrono) {
    if (r.type === "CHECK_IN") {
      open = r;
      const k = istDateKey(r.timestamp);
      if (!firstInOfDay.has(k)) firstInOfDay.set(k, r);
    } else if (open) {
      const ms = computeWorkedMs(open.timestamp, r.timestamp, open.pauses, open.workSegments);
      durationForCheckOut.set(r.id, ms);
      const k = istDateKey(open.timestamp);
      lastOutOfDay.set(k, r.timestamp);
      hoursByDay.set(k, (hoursByDay.get(k) ?? 0) + ms / 3600_000);
      if (r.timestamp >= weekAgo) weeklyMs += ms;
      open = null;
    }
  }
  if (open) {
    const ms = computeWorkedMs(open.timestamp, now, open.pauses, open.workSegments);
    const k = istDateKey(open.timestamp);
    hoursByDay.set(k, (hoursByDay.get(k) ?? 0) + ms / 3600_000);
    if (open.timestamp >= weekAgo) weeklyMs += ms;
  }

  // ---- this week (Mon..Sun, IST) ----
  const dowToday = (keyToDate(todayKey).getUTCDay() + 6) % 7;
  const mondayKey = addDays(todayKey, -dowToday);
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
    const key = addDays(mondayKey, i);
    return { day, hours: Math.round((hoursByDay.get(key) ?? 0) * 10) / 10, today: key === todayKey };
  });

  // ---- this month ----
  const monthDays = [...firstInOfDay.entries()].filter(([k]) => k >= monthStartKey);
  const lateDays = monthDays.filter(([, r]) => (r.lateMinutes ?? 0) > 0).length;
  const onTimeDays = monthDays.length - lateDays;
  let avgStart = "—";
  if (monthDays.length > 0) {
    const avg = monthDays.reduce((sum, [, r]) => {
      const t = istTimeOfDay(r.timestamp);
      return sum + t.hours * 60 + t.minutes;
    }, 0) / monthDays.length;
    avgStart = `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(Math.round(avg % 60)).padStart(2, "0")}`;
  }

  const year = Number(todayKey.slice(0, 4));
  const monthIdx = Number(todayKey.slice(5, 7)) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, monthIdx, 1)).getUTCDay() + 6) % 7;

  const cells: CalCell[] = Array.from({ length: firstDow }, () => ({ n: "", tag: "", kind: "blank" as const }));
  let leaveInMonth = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${todayKey.slice(0, 8)}${String(d).padStart(2, "0")}`;
    const dow = (keyToDate(key).getUTCDay() + 6) % 7;
    const special = specialDays[key];
    const rec = firstInOfDay.get(key);
    if (special?.kind === "leave") leaveInMonth++;
    let cell: CalCell;
    const out = lastOutOfDay.get(key);
    // "09:05 – 18:10", or "09:05 –" while the day is still open.
    const span = rec ? `${fmtTime(rec.timestamp)} –${out ? ` ${fmtTime(out)}` : ""}` : "";
    if (key === todayKey) cell = { n: String(d), tag: rec ? span : "Today", kind: "today" };
    else if (rec) cell = { n: String(d), tag: span, kind: (rec.lateMinutes ?? 0) > 0 ? "late" : "present" };
    else if (special?.kind === "leave") cell = { n: String(d), tag: "Leave", kind: "leave" };
    else if (special?.kind === "holiday") cell = { n: String(d), tag: special.label, kind: "holiday" };
    else if (dow >= 5) cell = { n: String(d), tag: "Off", kind: "off" };
    else cell = { n: String(d), tag: key < todayKey ? "–" : "", kind: "none" };
    cells.push(cell);
  }

  // ---- activity ----
  const activity: ActivityItem[] = records.slice(0, 8).map((r) => {
    const k = istDateKey(r.timestamp);
    const when = k === todayKey ? fmtTime(r.timestamp) : `${fmtWeekday(r.timestamp)} ${fmtTime(r.timestamp)}`;
    if (r.type === "CHECK_IN") {
      const late = r.lateMinutes ?? 0;
      return { when, title: "Checked in", detail: r.method === "PIN" ? "Face verified" : r.method, badge: late > 0 ? `Late ${late}m` : "On time", tone: late > 0 ? "wait" : "ok" };
    }
    const ms = durationForCheckOut.get(r.id);
    return { when, title: ms !== undefined ? `Checked out · ${fmtDur(ms)} worked` : "Checked out", detail: r.method === "PIN" ? "Face verified" : r.method, badge: "Complete", tone: "ok" };
  });

  // ---- requests ----
  type Req = RequestItem & { at: number };
  const requests: Req[] = [
    ...leaveReqs.map<Req>((r) => ({
      letter: "L", at: r.createdAt.getTime(),
      title: `${LEAVE_LABEL[r.type] ?? r.type} leave · ${fmtDateOnly(r.startDate)}${r.days > 1 ? `–${fmtDateOnly(r.endDate)}` : ""}`,
      sub: `${r.days} day${r.days === 1 ? "" : "s"} · requested ${fmtDay(r.createdAt)}`,
      status: statusTone(r.status).label, tone: statusTone(r.status).tone,
    })),
    ...permissions.map<Req>((p) => ({
      letter: "P", at: p.createdAt.getTime(),
      title: `Timed permission · ${fmtDay(p.startTime)} ${fmtTime(p.startTime)}–${fmtTime(p.endTime)}`,
      sub: `${fmtDur(p.endTime.getTime() - p.startTime.getTime())} · requested ${fmtDay(p.createdAt)}`,
      status: statusTone(p.approvalStatus).label, tone: statusTone(p.approvalStatus).tone,
    })),
    ...overtime.map<Req>((o) => ({
      letter: "O", at: o.createdAt.getTime(),
      title: `Overtime · until ${fmtTime(o.estimatedEndAt)}`,
      sub: o.reason.length > 60 ? `${o.reason.slice(0, 60)}…` : o.reason,
      status: statusTone(o.status).label, tone: statusTone(o.status).tone,
    })),
    ...manual.map<Req>((m) => ({
      letter: "M", at: m.createdAt.getTime(),
      title: `Manual entry · ${m.date}`,
      sub: m.reason.length > 60 ? `${m.reason.slice(0, 60)}…` : m.reason,
      status: statusTone(m.status).label, tone: statusTone(m.status).tone,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 10);

  // ---- up next: upcoming holidays, approved leave, pending leave ----
  const upcoming: (UpNext & { key: string })[] = [];
  for (const [key, s] of Object.entries(specialDays)) {
    if (key < todayKey || key > addDays(todayKey, 60)) continue;
    // Consecutive leave days collapse into the first one so a week off isn't seven rows.
    if (s.kind === "leave" && specialDays[addDays(key, -1)]?.kind === "leave" && addDays(key, -1) >= todayKey) continue;
    const d = keyToDate(key);
    upcoming.push({ key, mon: MONTHS[d.getUTCMonth()], day: String(d.getUTCDate()).padStart(2, "0"), title: s.kind === "holiday" ? s.label : `${s.label} leave`, sub: s.kind === "holiday" ? "Public holiday" : "Approved", tone: s.kind === "holiday" ? "info" : "ok" });
  }
  for (const r of leaveReqs) {
    if (r.status !== "PENDING") continue;
    const key = r.startDate.toISOString().slice(0, 10);
    if (key < todayKey) continue;
    upcoming.push({ key, mon: MONTHS[r.startDate.getUTCMonth()], day: String(r.startDate.getUTCDate()).padStart(2, "0"), title: `${LEAVE_LABEL[r.type] ?? r.type} leave`, sub: "Awaiting approval", tone: "wait" });
  }
  upcoming.sort((a, b) => a.key.localeCompare(b.key));

  const totalQuota = balances.reduce((s, b) => s + b.quota, 0);
  const totalUsed = balances.reduce((s, b) => s + b.used, 0);
  const hours7 = Math.round((weeklyMs / 3600_000) * 10) / 10;
  const pendingLeave = leaveReqs.find((r) => r.status === "PENDING");

  const insights: InsightsData = {
    monthRange: `${MONTHS[monthIdx]} 1–${Number(todayKey.slice(8, 10))}`,
    onTimePct: monthDays.length ? Math.round((onTimeDays / monthDays.length) * 100) : 0,
    onTimeLine: monthDays.length ? `${onTimeDays} of ${monthDays.length} days` : "No check-ins yet",
    hours7,
    hoursTarget: 40,
    leaveLine: `${totalUsed} of ${totalQuota} days`,
    leaveUsedPct: totalQuota > 0 ? Math.round((totalUsed / totalQuota) * 100) : 0,
    avgStart,
    week,
    upNext: upcoming.slice(0, 4),
  };

  const { greeting, dateLabel } = istGreeting(now);
  const initials = (session.user.name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

  return (
    <>
      <div
        className="rise"
        style={{ position: "relative", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 24, padding: 32, background: "var(--mp-surface)", border: "1px solid var(--mp-border)", borderRadius: 16 }}
      >
        <svg aria-hidden="true" width="260" height="260" viewBox="0 0 260 260" fill="none" style={{ position: "absolute", right: -40, top: -90, opacity: 0.9, pointerEvents: "none" }}>
          <circle className="dashed" cx="130" cy="130" r="100" stroke="#ef6c00" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="6 8" />
          <circle cx="130" cy="130" r="64" stroke="#ef6c00" strokeOpacity=".18" strokeWidth="1.5" />
        </svg>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, minWidth: 0 }}>
          <div style={{ position: "relative", width: 76, height: 76, flexShrink: 0 }}>
            <span className="ping" aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: 999, border: "2px solid var(--mp-primary)" }} />
            <span style={{ position: "absolute", inset: 0, borderRadius: 999, border: "2px solid var(--mp-primary)" }} />
            <span style={{ position: "absolute", inset: 8, borderRadius: 999, background: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>{initials}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <span className="chip" style={{ background: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {dateLabel} · {session.user.employeeCode}{me?.workMode ? ` · ${WORK_MODE_LABEL[me.workMode] ?? me.workMode}` : ""}
            </span>
            <h1 style={{ margin: "12px 0 0", fontSize: "clamp(30px, 4.5vw, 44px)", lineHeight: 1.12, fontWeight: 700, letterSpacing: "-0.035em" }}>
              {greeting}, <span style={{ color: "var(--mp-primary-dark)" }}>{firstName}.</span>
            </h1>
            <div style={{ height: 4, width: 120, marginTop: 8, borderRadius: 4, background: "var(--mp-primary)", transformOrigin: "left", animation: "mp-growx 1s cubic-bezier(.2,.7,.2,1) .6s backwards" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              <span className="chip">{lateDays === 0 && monthDays.length > 0 ? "No late arrivals this month" : `${lateDays} late this month`}</span>
              <span className="chip">{hours7}h in the last 7 days</span>
              <span className="chip">Avg start {avgStart}</span>
            </div>
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <RequestButtons leaveOptions={balances.map((b) => ({ type: b.type, label: LEAVE_LABEL[b.type] ?? b.type, remaining: b.remaining }))} />
        </div>
      </div>

      <EmployeeCheckIn employeeCode={session.user.employeeCode} firstName={firstName} />

      <InsightsRow d={insights} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <MyPageTabs
          data={{
            monthLabel: `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][monthIdx]} ${year}`,
            counts: { present: onTimeDays, late: lateDays, leave: leaveInMonth },
            cells,
            activity,
            requests: requests.map((r) => ({ letter: r.letter, title: r.title, sub: r.sub, status: r.status, tone: r.tone })),
          }}
        />
        <aside style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <LeavePanel
            rings={balances.map((b) => ({ name: LEAVE_LABEL[b.type] ?? b.type, used: b.used, quota: b.quota, color: LEAVE_COLOR[b.type] ?? "#1a1512" }))}
            pendingLeave={pendingLeave ? `${fmtDateOnly(pendingLeave.startDate)}${pendingLeave.days > 1 ? `–${fmtDateOnly(pendingLeave.endDate)}` : ""} · ${LEAVE_LABEL[pendingLeave.type] ?? pendingLeave.type}` : null}
            permissionsApproved={permissions.filter((p) => p.approvalStatus === "APPROVED" && p.startTime >= monthStart).length}
            overtimePending={overtime.filter((o) => o.status === "PENDING").length}
          />
        </aside>
      </div>
    </>
  );
}
