"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, ChevronDown, Clock, Trash2, X } from "lucide-react";
import { TONE_STYLE, type Tone } from "./MyPageCards";
import {
  dismissNotifications,
  getNotificationMarks,
  getServerNotificationMarks,
  initNotificationMarks,
  markNotificationsRead,
  subscribeNotificationMarks,
} from "@/lib/notificationMarks";

export type NotifTone = "good" | "bad" | "warn" | "brand";
export type NotifItem = {
  /** Embeds the status it describes, so a status change makes a fresh (unread) notification. */
  id: string;
  group: "Today" | "Earlier";
  kind: "approvals" | "alerts";
  tone: NotifTone;
  icon: "check" | "close" | "clock";
  title: string;
  time: string;
  summary: string;
  details: { k: string; v: string; tone?: NotifTone }[];
  cta: string;
  /** Which My Page tab the call-to-action opens. */
  target: "requests" | "activity";
  sortAt: number;
};

const TONE: Record<NotifTone, Tone> = { good: "ok", bad: "bad", warn: "wait", brand: "info" };
const ICON = { check: Check, close: X, clock: Clock } as const;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "approvals", label: "Approvals" },
  { key: "alerts", label: "Alerts" },
] as const;

/**
 * The notifications bell on the greeting card. It opens a dropdown right under it with the same notifications the phone
 * app shows (leave, permission and overtime decisions, and late arrivals), so nothing on the page moves. Read and cleared
 * marks are kept in this browser, per employee.
 */
export default function NotificationsBell({ items, userId }: { items: NotifItem[]; userId: string }) {
  const { marks, loaded } = useSyncExternalStore(subscribeNotificationMarks, getNotificationMarks, getServerNotificationMarks);
  useEffect(() => initNotificationMarks(userId), [userId]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = items.filter((n) => !marks.dismissed[n.id]).sort((a, b) => b.sortAt - a.sortAt);
  const unread = visible.filter((n) => !marks.read[n.id]).length;
  const shown = visible.filter((n) => filter === "all" || n.kind === filter);
  const groups = (["Today", "Earlier"] as const).map((g) => ({ g, rows: shown.filter((n) => n.group === g) })).filter((x) => x.rows.length > 0);

  function openMenu() {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 10, right: Math.max(12, window.innerWidth - r.right) });
  }
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    // Scrolling the list inside the dropdown must not close it; scrolling the page behind it does.
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Element && e.target.closest(".mp-pop"))) setPos(null);
    };
    const onResize = () => setPos(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [pos]);

  function toggle(n: NotifItem) {
    markNotificationsRead([n.id]);
    setExpanded((cur) => (cur === n.id ? null : n.id));
  }

  function go(n: NotifItem) {
    close();
    // The workspace tabs live in their own component: ask them to switch, then scroll there.
    window.dispatchEvent(new CustomEvent("mp-tab", { detail: n.target === "requests" ? 2 : 1 }));
    setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="mp-bell"
        onClick={() => (pos ? close() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={Boolean(pos)}
        aria-label={loaded && unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell size={22} strokeWidth={1.9} aria-hidden />
        {loaded && unread > 0 && <span className="mp-bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {pos &&
        createPortal(
          <div className="mp mp-pop-wrap" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="mp-pop" role="dialog" aria-label="Notifications" style={{ top: pos.top, right: pos.right }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px 10px" }}>
                <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--mp-primary-muted)", color: "var(--mp-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Bell size={19} />
                </span>
                <strong style={{ fontSize: 19, flex: 1 }}>Notifications</strong>
                {unread > 0 && (
                  <span className="chip" style={{ background: "var(--mp-primary)", color: "#fff" }}>
                    {unread} new
                  </span>
                )}
                {unread > 0 && (
                  <button type="button" className="mp-link" onClick={() => markNotificationsRead(visible.map((n) => n.id))}>
                    Mark all read
                  </button>
                )}
              </div>

              <div role="tablist" aria-label="Filter notifications" className="tabs" style={{ margin: "0 20px 12px", alignSelf: "flex-start" }}>
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "on" : ""} onClick={() => setFilter(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ maxHeight: "min(520px, 62vh)", overflowY: "auto", padding: "0 14px 6px" }}>
                {groups.length === 0 && (
                  <p className="sub" style={{ margin: "16px 10px 20px", textAlign: "center" }}>
                    You&apos;re all caught up. Leave and overtime decisions and late arrivals will show up here.
                  </p>
                )}
                {groups.map(({ g, rows }) => (
                  <section key={g} aria-label={g} style={{ marginBottom: 6 }}>
                    <div className="label" style={{ padding: "8px 4px 6px" }}>{g}</div>
                    {rows.map((n) => {
                      const Icon = ICON[n.icon];
                      const style = TONE_STYLE[TONE[n.tone]];
                      const isOpen = expanded === n.id;
                      const isUnread = !marks.read[n.id];
                      return (
                        <div key={n.id} className={`mp-ncard${isUnread ? " unread" : ""}`}>
                          <button type="button" className="mp-notif-head" onClick={() => toggle(n)} aria-expanded={isOpen}>
                            <span style={{ width: 42, height: 42, borderRadius: 999, flexShrink: 0, background: style.bg, color: style.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Icon size={19} strokeWidth={2.2} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", textAlign: "left" }}>
                              <span style={{ fontWeight: 700, fontSize: 15 }}>{n.title}</span>
                              <span className="sub" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.summary}</span>
                            </span>
                            <span className="mp-ntime">{n.time}</span>
                            <ChevronDown size={16} aria-hidden style={{ flexShrink: 0, color: "var(--mp-text2)", transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }} />
                          </button>
                          {isOpen && (
                            <div className="mp-nbody">
                              <div className="mp-ngrid">
                                {n.details.map((d) => (
                                  <div key={d.k}>
                                    <div className="mp-nk">{d.k}</div>
                                    {d.tone ? (
                                      <span className="mp-npill" style={{ background: TONE_STYLE[TONE[d.tone]].bg, color: TONE_STYLE[TONE[d.tone]].color }}>{d.v}</span>
                                    ) : (
                                      <div className="mp-nv">{d.v}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <button type="button" className="btn btn-primary" style={{ minHeight: 40, padding: "0 18px", fontSize: 14 }} onClick={() => go(n)}>
                                  {n.cta}
                                </button>
                                <button type="button" className="mp-link" onClick={() => dismissNotifications([n.id])}>
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>

              {visible.length > 0 && (
                <div style={{ padding: "8px 16px 12px", borderTop: "1px solid var(--mp-border)", marginTop: 6 }}>
                  <button type="button" className="mp-link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => dismissNotifications(visible.map((n) => n.id))}>
                    <Trash2 size={14} /> Clear all
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
