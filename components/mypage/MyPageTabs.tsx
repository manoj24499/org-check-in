"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TONE_STYLE, type Tone } from "./MyPageCards";

export type CalCell = { n: string; tag: string; kind: "present" | "late" | "leave" | "holiday" | "today" | "off" | "none" | "blank" };
export type ActivityItem = { when: string; title: string; detail: string; badge: string; tone: Tone };
export type RequestKind = "leave" | "permission" | "overtime" | "manual";
export type RequestItem = {
  id: string;
  kind: RequestKind;
  /** True while it is still pending, i.e. the employee can withdraw it. */
  canCancel: boolean;
  letter: string;
  title: string;
  sub: string;
  status: string;
  tone: Tone;
};

const CANCEL_PATH: Record<RequestKind, string> = {
  leave: "leave-requests",
  permission: "timed-permission",
  overtime: "overtime",
  manual: "manual-entry-requests",
};

export type TabsData = {
  monthLabel: string;
  counts: { present: number; late: number; leave: number };
  cells: CalCell[];
  activity: ActivityItem[];
  requests: RequestItem[];
};

const TABS = ["Calendar", "Activity", "Requests"] as const;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CELL: Record<CalCell["kind"], { bg: string; color: string; border: string }> = {
  present: { bg: "var(--mp-success-muted)", color: "var(--mp-success)", border: "transparent" },
  late: { bg: "var(--mp-warning-muted)", color: "#7a5a07", border: "transparent" },
  leave: { bg: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", border: "transparent" },
  holiday: { bg: "rgba(26,21,18,0.06)", color: "var(--mp-text)", border: "transparent" },
  today: { bg: "#fff", color: "var(--mp-primary-dark)", border: "var(--mp-primary)" },
  off: { bg: "var(--mp-muted)", color: "var(--mp-text2)", border: "transparent" },
  none: { bg: "transparent", color: "var(--mp-text3)", border: "var(--mp-border)" },
  blank: { bg: "transparent", color: "transparent", border: "transparent" },
};

export default function MyPageTabs({ data }: { data: TabsData }) {
  const [tab, setTab] = useState(0);
  const router = useRouter();
  // Cancelling asks once more ("Yes, cancel") so a stray click can't withdraw a request.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancelRequest(r: RequestItem) {
    setBusyId(r.id);
    setCancelError(null);
    try {
      // A leave request is marked cancelled (it stays in the history); the others are simply withdrawn.
      const res = await fetch(`/api/mobile/me/${CANCEL_PATH[r.kind]}/${r.id}`, { method: r.kind === "leave" ? "PATCH" : "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCancelError(data.error ?? `Something went wrong (error ${res.status}). Please try again.`);
      } else {
        setConfirmId(null);
        router.refresh();
      }
    } catch {
      setCancelError("Network error. Please try again.");
    }
    setBusyId(null);
  }

  // The notifications panel asks for a tab (e.g. Requests) before scrolling here.
  useEffect(() => {
    const onTab = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (n === 0 || n === 1 || n === 2) setTab(n);
    };
    window.addEventListener("mp-tab", onTab);
    return () => window.removeEventListener("mp-tab", onTab);
  }, []);

  return (
    <section id="workspace" className="card nohover rise" style={{ animationDelay: ".3s", flex: "999 1 560px", minWidth: 0, padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      <div role="tablist" aria-label="Workspace" className="tabs" style={{ alignSelf: "flex-start" }}>
        {TABS.map((t, i) => (
          <button key={t} type="button" role="tab" aria-selected={tab === i} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="tabin" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 700 }}>{data.monthLabel}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span className="chip" style={{ background: TONE_STYLE.ok.bg, color: TONE_STYLE.ok.color }}>{data.counts.present} present</span>
              <span className="chip" style={{ background: TONE_STYLE.wait.bg, color: TONE_STYLE.wait.color }}>{data.counts.late} late</span>
              <span className="chip" style={{ background: TONE_STYLE.info.bg, color: TONE_STYLE.info.color }}>{data.counts.leave} leave</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
            {WEEKDAYS.map((d) => (
              <span key={d} className="label" style={{ textAlign: "center" }}>{d}</span>
            ))}
            {data.cells.map((c, i) => {
              const s = CELL[c.kind];
              return (
                <div
                  key={i}
                  className={c.kind === "blank" ? undefined : "cell"}
                  style={{
                    animationDelay: `${(0.05 + i * 0.012).toFixed(2)}s`, minHeight: 72, borderRadius: 12, padding: "10px 8px 8px 10px", boxSizing: "border-box",
                    display: "flex", flexDirection: "column", justifyContent: "space-between", background: s.bg, border: `1px solid ${s.border}`,
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: "18px", fontWeight: 600, color: c.kind === "today" ? "var(--mp-primary-dark)" : "var(--mp-text)" }}>{c.n}</span>
                  <span title={c.tag} style={{ fontSize: 12, lineHeight: "16px", color: s.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tag}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="tabin" style={{ display: "flex", flexDirection: "column" }}>
          {data.activity.length === 0 && <p className="sub" style={{ margin: 0 }}>No activity yet. Your check-ins and check-outs will show up here.</p>}
          {data.activity.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 16, paddingBottom: 22 }}>
              <span className="sub" style={{ width: 84, flexShrink: 0, fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>{a.when}</span>
              <div style={{ position: "relative", width: 12, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                {i < data.activity.length - 1 && <span style={{ position: "absolute", top: 14, bottom: -22, width: 2, background: "var(--mp-border)" }} />}
                <span style={{ position: "relative", marginTop: 5, width: 12, height: 12, borderRadius: 999, background: TONE_STYLE[a.tone].color, boxShadow: "0 0 0 4px var(--mp-surface)" }} />
              </div>
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600 }}>{a.title}</span>
                <span className="sub">{a.detail}</span>
              </div>
              <span style={{ alignSelf: "flex-start", padding: "2px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: TONE_STYLE[a.tone].bg, color: TONE_STYLE[a.tone].color }}>{a.badge}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 2 && (
        <div className="tabin" style={{ display: "flex", flexDirection: "column" }}>
          {data.requests.length === 0 && <p className="sub" style={{ margin: 0 }}>No requests yet. Leave, permission, overtime and manual-entry requests appear here with their status.</p>}
          {cancelError && (
            <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: "var(--mp-danger-muted)", color: "var(--mp-danger)", fontSize: 14 }}>
              {cancelError}
            </div>
          )}
          {data.requests.map((r) => (
            <div key={r.id} className="row-hover" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: 16, borderRadius: 8 }}>
              <span style={{ width: 44, height: 44, borderRadius: 999, background: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{r.letter}</span>
              <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600 }}>{r.title}</span>
                <span className="sub">{r.sub}</span>
              </div>
              <span style={{ padding: "2px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: TONE_STYLE[r.tone].bg, color: TONE_STYLE[r.tone].color }}>{r.status}</span>
              {r.canCancel &&
                (confirmId === r.id ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexBasis: "100%", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <span className="sub" style={{ fontSize: 13 }}>{r.status === "Approved" ? "Already approved. Cancel it anyway?" : "Cancel this request?"}</span>
                    <button type="button" className="btn btn-primary" style={{ minHeight: 34, padding: "0 14px", fontSize: 13 }} disabled={busyId === r.id} onClick={() => void cancelRequest(r)}>
                      {busyId === r.id ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button type="button" className="mp-link" disabled={busyId === r.id} onClick={() => { setConfirmId(null); setCancelError(null); }}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-outline" style={{ minHeight: 34, padding: "0 14px", fontSize: 13 }} onClick={() => { setConfirmId(r.id); setCancelError(null); }}>
                    Cancel
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
