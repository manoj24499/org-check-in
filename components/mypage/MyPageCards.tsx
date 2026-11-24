// Server-safe presentational cards for My Page (no hooks): monthly rings, weekly hours, up next and leave balance.

export type Tone = "ok" | "wait" | "bad" | "info" | "plain";

export const TONE_STYLE: Record<Tone, { bg: string; color: string }> = {
  ok: { bg: "var(--mp-success-muted)", color: "var(--mp-success)" },
  wait: { bg: "var(--mp-warning-muted)", color: "#7a5a07" },
  bad: { bg: "var(--mp-danger-muted)", color: "var(--mp-danger)" },
  info: { bg: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)" },
  plain: { bg: "var(--mp-muted)", color: "var(--mp-text)" },
};

export type WeekBar = { day: string; hours: number; today: boolean };
export type UpNext = { mon: string; day: string; title: string; sub: string; tone: Tone };
export type LeaveRing = { name: string; used: number; quota: number; color: string };

export type InsightsData = {
  monthRange: string;
  onTimePct: number;
  onTimeLine: string;
  hours7: number;
  hoursTarget: number;
  leaveLine: string;
  leaveUsedPct: number;
  avgStart: string;
  week: WeekBar[];
  upNext: UpNext[];
};

const R1 = 72, R2 = 55, R3 = 38;
const circ = (r: number) => 2 * Math.PI * r;

function Ring({ r, pct, color }: { r: number; pct: number; color: string }) {
  const c = circ(r);
  const off = c * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <circle
      className="ringarc"
      cx="84" cy="84" r={r} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round"
      style={{ ["--c" as string]: c.toFixed(1), ["--off" as string]: off.toFixed(1) }}
    />
  );
}

export function InsightsRow({ d }: { d: InsightsData }) {
  const maxH = Math.max(9, ...d.week.map((w) => w.hours));
  return (
    <section id="insights" aria-label="Insights" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
      <div className="card rise" style={{ animationDelay: ".2s", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>This month</h3>
          <span className="sub">{d.monthRange}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <div style={{ position: "relative", width: 168, height: 168 }}>
            <svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
              {[R1, R2, R3].map((r) => (
                <circle key={r} cx="84" cy="84" r={r} fill="none" stroke="#f4f1ed" strokeWidth="11" />
              ))}
              <Ring r={R1} pct={d.onTimePct / 100} color="#2e6f52" />
              <Ring r={R2} pct={d.hours7 / d.hoursTarget} color="#ef6c00" />
              <Ring r={R3} pct={d.leaveUsedPct / 100} color="#1a1512" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{d.onTimePct}%</span>
              <span className="sub" style={{ lineHeight: "16px" }}>on time</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", borderTop: "1px solid var(--mp-border)", paddingTop: 20 }}>
            {[
              { c: "#2e6f52", a: d.onTimeLine, b: "On time" },
              { c: "#ef6c00", a: `${d.hours7.toFixed(1)}h of ${d.hoursTarget}h`, b: "Last 7 days" },
              { c: "#1a1512", a: d.leaveLine, b: "Leave used this year" },
            ].map((row) => (
              <div key={row.b} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: row.c, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.a}</span>
                  <span className="sub" style={{ lineHeight: "16px" }}>{row.b}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card rise" style={{ animationDelay: ".25s", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>Hours this week</h3>
          <span className="sub">avg start {d.avgStart}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 260, position: "relative" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: `calc(${(8 / maxH) * 190}px + 44px)`, borderTop: "1px dashed rgba(26,21,18,0.25)" }} />
          <span style={{ position: "absolute", right: 0, bottom: `calc(${(8 / maxH) * 190}px + 48px)`, fontSize: 12, color: "var(--mp-text2)", background: "var(--mp-surface)", paddingLeft: 6 }}>8h</span>
          {d.week.map((w) => (
            <div key={w.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "flex-end", height: "100%" }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{w.hours ? w.hours.toFixed(1) : "–"}</span>
              <div className="bar" style={{ width: "100%", maxWidth: 40, height: Math.max(4, Math.round((w.hours / maxH) * 190)), borderRadius: 6, background: w.today ? "var(--mp-primary)" : "#1a1512" }} />
              <span className="sub" style={{ lineHeight: "16px", fontWeight: w.today ? 600 : 400 }}>{w.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card rise" style={{ animationDelay: ".3s", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>Up next</h3>
        {d.upNext.length === 0 && <p className="sub" style={{ margin: 0 }}>Nothing coming up. Holidays, approved leave and permissions appear here.</p>}
        {d.upNext.map((u, i) => (
          <div key={`${u.mon}${u.day}${i}`} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 52, flexShrink: 0, borderRadius: 8, background: TONE_STYLE[u.tone].bg, padding: "8px 0", textAlign: "center", display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12, lineHeight: "14px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: TONE_STYLE[u.tone].color }}>{u.mon}</span>
              <span style={{ fontSize: 20, lineHeight: "24px", fontWeight: 700 }}>{u.day}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{u.title}</span>
              <span className="sub">{u.sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LeavePanel({
  rings,
  pendingLeave,
  permissionsApproved,
  overtimePending,
}: {
  rings: LeaveRing[];
  pendingLeave: string | null;
  permissionsApproved: number;
  overtimePending: number;
}) {
  return (
    <section id="leave" className="card rise" style={{ animationDelay: ".35s", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ margin: 0, fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>Leave balance</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {rings.map((l) => {
          const remaining = Math.max(0, l.quota - l.used);
          const frac = l.quota > 0 ? remaining / l.quota : 0;
          const c = 2 * Math.PI * 30;
          return (
            <div key={l.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{ position: "relative", width: 76, height: 76 }}>
                <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="38" cy="38" r="30" fill="none" stroke="#f4f1ed" strokeWidth="8" />
                  <circle className="ringarc" cx="38" cy="38" r="30" fill="none" stroke={l.color} strokeWidth="8" strokeLinecap="round" style={{ ["--c" as string]: c.toFixed(1), ["--off" as string]: (c * (1 - frac)).toFixed(1) }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{remaining}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, lineHeight: "18px" }}>{l.name}</span>
                <span className="sub">of {l.quota} days</span>
              </div>
            </div>
          );
        })}
      </div>
      {pendingLeave && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 16px", borderRadius: 999, background: "var(--mp-warning-muted)" }}>
          <span style={{ fontSize: 13 }}>{pendingLeave}</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Pending</span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <div style={{ background: "var(--mp-muted)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Permissions</span>
          <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700 }}>{permissionsApproved}</span>
          <span className="sub">approved this month</span>
        </div>
        <div style={{ background: "var(--mp-muted)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="label">Overtime</span>
          <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700 }}>{overtimePending}</span>
          <span className="sub">awaiting approval</span>
        </div>
      </div>
    </section>
  );
}
