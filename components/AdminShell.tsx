"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarClock,
  CalendarOff,
  Compass,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";
import AdminTour, { TOUR_START_EVENT } from "./AdminTour";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "leave" | "overtime" | "support" };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Overview",
    items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Workforce",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users },
      { href: "/admin/field-workers", label: "Field workers", icon: MapPinned },
      { href: "/admin/shifts", label: "Shifts", icon: CalendarClock },
    ],
  },
  {
    title: "Requests",
    items: [
      { href: "/admin/leave", label: "Leave", icon: CalendarOff, badge: "leave" },
      { href: "/admin/overtime", label: "Overtime", icon: Timer, badge: "overtime" },
      { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: "support" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/admin/office-location", label: "Office location", icon: MapPin },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const STORAGE_KEY = "admin_sidebar_collapsed";
const CHANGE_EVENT = "admin-sidebar-change";

// The collapse preference lives in localStorage; useSyncExternalStore keeps
// server HTML and first client render in agreement (server snapshot is
// always "expanded") and re-renders once the stored value is known.
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/**
 * The admin app shell: a left sidebar with grouped, icon-led navigation, a
 * user card and sign-out. On desktop (>= lg) it can collapse to an icon rail
 * (the choice is remembered per browser); below lg it becomes a slim top bar
 * that opens the same navigation as a slide-in drawer. `banner` (the face-
 * verification status strip) and `children` sit in the scrolling column to
 * the right, so only the page content scrolls and the sidebar stays put.
 */
export default function AdminShell({
  userName,
  orgName,
  pendingLeaveCount,
  pendingOvertimeCount,
  pendingSupportCount,
  banner,
  children,
}: {
  userName?: string | null;
  orgName?: string | null;
  pendingLeaveCount: number;
  pendingOvertimeCount: number;
  pendingSupportCount: number;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapsed() {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    } catch {
      // Storage can be blocked; the toggle just won't be remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  // Lock page scroll behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const badges = { leave: pendingLeaveCount, overtime: pendingOvertimeCount, support: pendingSupportCount };

  function renderNav(compact: boolean) {
    return (
      <nav className="flex flex-col gap-5" aria-label="Admin">
        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {compact ? (
              <div className="mx-3 mb-1 h-px bg-border-soft first:hidden" />
            ) : (
              <p className="px-3 pb-1 text-[10.5px] font-medium tracking-[0.14em] uppercase text-muted-2">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = pathname?.startsWith(href);
              const count = badge ? badges[badge] : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  title={compact ? label : undefined}
                  data-tour={`nav-${href}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    compact ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-primary/10 font-medium text-primary-dark"
                      : "text-muted-2 hover:bg-black/[0.04] hover:text-foreground"
                  }`}
                >
                  {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />}
                  <span className="relative shrink-0">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.9} />
                    {compact && count > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-[3px] text-[8.5px] font-semibold leading-none text-white">
                        {count}
                      </span>
                    )}
                  </span>
                  {!compact && <span className="truncate">{label}</span>}
                  {!compact && count > 0 && (
                    <span className="ml-auto grid h-[19px] min-w-[19px] place-items-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold tabular-nums text-white">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  function renderTourButton(compact: boolean) {
    return (
      <button
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          window.dispatchEvent(new Event(TOUR_START_EVENT));
        }}
        title={compact ? "Take a tour" : undefined}
        aria-label="Take a tour"
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-2 transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          compact ? "justify-center" : ""
        }`}
      >
        <Compass className="h-[18px] w-[18px]" />
        {!compact && <span>Take a tour</span>}
      </button>
    );
  }

  function renderUser(compact: boolean) {
    return (
      <div className={`flex items-center gap-3 ${compact ? "flex-col" : ""}`}>
        <span
          title={compact ? (userName ?? "Admin") : undefined}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary-dark"
        >
          {initials(userName)}
        </span>
        {!compact && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium text-foreground">{userName ?? "Admin"}</p>
            <p className="text-[11.5px] text-muted-2">Administrator</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          aria-label="Sign out"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderBrand(compact: boolean) {
    return (
      <div className={`flex items-center gap-2.5 ${compact ? "justify-center" : ""}`}>
        <Logo variant="static" size={compact ? 26 : 24} className="shrink-0 text-foreground" />
        {!compact && (
          <div className="min-w-0 leading-tight">
            <p className="text-[15px] font-medium tracking-[-0.02em] text-foreground">Inzivo</p>
            <p className="truncate text-[11.5px] text-muted-2">{orgName ?? "Admin console"}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-root flex h-screen overflow-hidden bg-surface text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-border bg-surface-2 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[72px]" : "w-[256px]"
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-border-soft ${collapsed ? "px-0" : "px-5"}`}>
          <div className={collapsed ? "w-full" : "flex-1"}>{renderBrand(collapsed)}</div>
        </div>

        <div className={`no-scrollbar flex-1 overflow-y-auto py-5 ${collapsed ? "px-3" : "px-4"}`}>{renderNav(collapsed)}</div>

        <div className={`shrink-0 border-t border-border-soft ${collapsed ? "px-3 py-3" : "px-4 py-3"}`}>
          <div className="mb-1">{renderTourButton(collapsed)}</div>
          <div className="mb-1">
            <ThemeToggle compact={collapsed} />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`mb-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-2 transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          {renderUser(collapsed)}
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile / tablet top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface-2 px-4 lg:hidden">
          {renderBrand(false)}
          <div className="-mr-2 flex items-center">
            <ThemeToggle compact />
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="grid h-10 w-10 place-items-center rounded-lg text-muted-2 hover:bg-black/[0.04]"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        {banner}
        <main className="admin-canvas flex-1 overflow-y-auto">{children}</main>
      </div>

      <AdminTour userName={userName} />

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`} aria-hidden={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-200 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface-2 shadow-2xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-soft px-5">
            {renderBrand(false)}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="-mr-2 grid h-9 w-9 place-items-center rounded-lg text-muted-2 hover:bg-black/[0.05]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-5">{renderNav(false)}</div>
          <div className="shrink-0 border-t border-border-soft px-4 py-3">
            <div className="mb-1">{renderTourButton(false)}</div>
            <div className="mb-2">
              <ThemeToggle />
            </div>
            {renderUser(false)}
          </div>
        </aside>
      </div>
    </div>
  );
}
