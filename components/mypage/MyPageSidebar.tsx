"use client";

import { signOut } from "next-auth/react";
import { CalendarDays, Clock, Home, LogOut, Palmtree } from "lucide-react";
import { Logo } from "@/components/Logo";
import ChangePinButton from "@/components/ChangePinButton";

const LINKS = [
  { href: "#today", label: "My Page", Icon: Home },
  { href: "#workspace", label: "Calendar & activity", Icon: CalendarDays },
  { href: "#leave", label: "Leave & permissions", Icon: Palmtree },
  { href: "#insights", label: "Hours & overtime", Icon: Clock },
] as const;

export default function MyPageSidebar({ name, initials, employeeCode }: { name: string; initials: string; employeeCode: string }) {
  return (
    <div className="side-wrap">
      <aside className="side" aria-label="Sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px", flexShrink: 0, height: 32 }}>
          <span style={{ flexShrink: 0, display: "grid", placeItems: "center", width: 32 }}>
            <Logo variant="static" size={20} className="text-foreground" />
          </span>
          <span className="lbl" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Inzivo
          </span>
        </div>

        <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
          {LINKS.map(({ href, label, Icon }, i) => (
            <a key={href} className={`side-link${i === 0 ? " side-on" : ""}`} href={href}>
              <Icon size={20} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
              <span className="lbl">{label}</span>
            </a>
          ))}
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ChangePinButton variant="side" />
          <button type="button" className="side-link" onClick={() => signOut({ callbackUrl: "/login" })}>
            <LogOut size={20} strokeWidth={1.8} style={{ flexShrink: 0 }} aria-hidden />
            <span className="lbl">Sign out</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              width: 44, height: 44, borderRadius: 999, background: "var(--mp-muted)", border: "1px solid var(--mp-border)",
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, flexShrink: 0,
            }}
          >
            {initials}
          </span>
          <div className="lbl" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{name}</span>
            <span className="sub">{employeeCode}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
