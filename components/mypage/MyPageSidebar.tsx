"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { CalendarDays, ChartPie, Clock, Home, LogOut } from "lucide-react";
import { Logo } from "@/components/Logo";
import ChangePinButton from "@/components/ChangePinButton";

const LINKS = [
  { id: "today", label: "Today", anim: "hop", Icon: Home },
  { id: "insights", label: "Hours & overtime", short: "Hours", anim: "tick", Icon: Clock },
  { id: "workspace", label: "Calendar & activity", short: "Calendar", anim: "flip", Icon: CalendarDays },
  { id: "leave", label: "Leave balances", short: "Leave", anim: "spin", Icon: ChartPie },
] as const;

export default function MyPageSidebar({ name, initials, employeeCode }: { name: string; initials: string; employeeCode: string }) {
  const [active, setActive] = useState<string>(LINKS[0].id);
  // While a click is scrolling the page, the scroll watcher must not move the highlight (it would flicker through
  // every section on the way).
  const locked = useRef(false);

  // Highlights the section nearest the top of the screen while the page scrolls.
  useEffect(() => {
    const els = LINKS.map((l) => document.getElementById(l.id)).filter((e): e is HTMLElement => Boolean(e));
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size === 0 || locked.current) return;
        const top = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]![0];
        setActive(top);
      },
      { rootMargin: "-10% 0px -55% 0px", threshold: [0, 0.2] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // A button that scrolls, not an `#anchor` link: nothing here should ever navigate or reload the page.
  function go(id: string) {
    setActive(id);
    locked.current = true;
    setTimeout(() => {
      locked.current = false;
    }, 1000);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="side-wrap">
      <aside className="side" aria-label="Sidebar">
        <div className="side-brand">
          <Logo variant="static" size={22} className="text-foreground" />
          <span>Inzivo</span>
        </div>

        <div className="side-profile">
          <span className="side-avatar">{initials}</span>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            <span className="sub">{employeeCode}</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Primary">
          <span className="side-heading">Menu</span>
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`side-link${active === l.id ? " side-on" : ""}`}
              aria-current={active === l.id ? "true" : undefined}
              onClick={() => go(l.id)}
            >
              <span className={`ico ico-${l.anim}`}>
                <l.Icon size={19} strokeWidth={1.9} aria-hidden />
              </span>
              <span className="lbl">{l.label}</span>
              <span className="lbl-short">{"short" in l ? l.short : l.label}</span>
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <span className="side-heading">Account</span>
          <ChangePinButton variant="side" />
          <button type="button" className="side-link" onClick={() => signOut({ callbackUrl: "/login/employee" })}>
            <span className="ico ico-nudge">
              <LogOut size={19} strokeWidth={1.9} aria-hidden />
            </span>
            <span className="lbl">Sign out</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
