"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  Clock,
  KeyRound,
  PencilLine,
  Compass,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  MapPinned,
  Menu,
  Monitor,
  Presentation,
  Route,
  Settings,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";
import AdminTour, { TOUR_START_EVENT } from "./AdminTour";
import { COUNTS_REFRESH_EVENT } from "./adminCountsEvent";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "leave" | "overtime" | "support" | "notifications" };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
    ],
  },
  {
    title: "Workforce",
    items: [
      { href: "/admin/employees", label: "Employees", icon: Users },
      { href: "/admin/field-workers", label: "Field workers", icon: MapPinned },
      { href: "/admin/location-history", label: "Location history", icon: Route },
      { href: "/admin/shifts", label: "Shifts", icon: CalendarClock },
      { href: "/admin/leave-balances", label: "Leave balances", icon: CalendarCheck },
    ],
  },
  {
    title: "Requests",
    items: [
      { href: "/admin/leave", label: "Leave", icon: CalendarOff, badge: "leave" },
      { href: "/admin/overtime", label: "Overtime", icon: Timer, badge: "overtime" },
      { href: "/admin/permissions", label: "Permissions", icon: Clock },
      { href: "/admin/meetings", label: "Meetings", icon: Presentation },
      { href: "/admin/manual-entries", label: "Manual entries", icon: PencilLine },
      { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: "support" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/admin/office-location", label: "Office location", icon: MapPin },
      { href: "/admin/kiosk-devices", label: "Kiosk devices", icon: Monitor },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/**
 * The admin app shell: a left sidebar with grouped, icon-led navigation, a
 * user card and sign-out. On desktop (>= lg) it rests as a slim icon rail and widens while
 * the pointer (or keyboard focus) is on it, with the page resizing alongside it; below lg it becomes a slim top bar
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
  notificationCount,
  banner,
  children,
}: {
  userName?: string | null;
  orgName?: string | null;
  pendingLeaveCount: number;
  pendingOvertimeCount: number;
  pendingSupportCount: number;
  notificationCount: number;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Desktop sidebar: an icon rail that opens while hovered or holding keyboard focus.
  const [hovered, setHovered] = useState(false);
  // A short delay before opening or closing, so brushing the pointer past the edge does not flicker the page.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setHoverAfter(open: boolean, delayMs: number) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (delayMs <= 0) setHovered(open);
    else hoverTimer.current = setTimeout(() => setHovered(open), delayMs);
  }
  const openSoon = () => setHoverAfter(true, 90);
  const openNow = () => setHoverAfter(true, 0);
  const closeSoon = () => setHoverAfter(false, 180);
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The page resizes with the sidebar. Leaflet maps only re-measure on a window resize, so announce one when
  // the width animation (300 ms) has finished, or a map would keep its old size and show grey tiles.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 340);
    return () => clearTimeout(t);
  }, [hovered]);

  // Lock page scroll behind the open drawer.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // The layout only runs on a full page load, so these start from what it computed and are then kept fresh
  // here: after every page change, when the tab is focused again, every 15 seconds while the tab is open,
  // and right after the admin approves, declines or deletes something (see adminCountsEvent). When the
  // `signature` changes (a new request, alert or check-in arrived) the open page is re-rendered with fresh
  // data, so new items appear without reloading.
  const [fresh, setFresh] = useState<{ leave: number; overtime: number; support: number; notifications: number } | null>(null);
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = (skipCache = false) => {
      fetch(skipCache ? "/api/admin/badge-counts?fresh=1" : "/api/admin/badge-counts", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (!alive || !c) return;
          setFresh(c);
          if (lastSignature.current !== null && c.signature !== lastSignature.current) router.refresh();
          lastSignature.current = c.signature;
        })
        .catch(() => {});
    };
    load();
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    const loadFresh = () => load(true);
    window.addEventListener(COUNTS_REFRESH_EVENT, loadFresh);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15_000);
    return () => {
      alive = false;
      window.removeEventListener(COUNTS_REFRESH_EVENT, loadFresh);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const badges = fresh ?? {
    leave: pendingLeaveCount,
    overtime: pendingOvertimeCount,
    support: pendingSupportCount,
    notifications: notificationCount,
  };

  // `rail` = the desktop sidebar, which rests as a narrow icon strip and widens on hover. In the rail every
  // icon keeps the same position in both states and only the text fades in and out, so nothing slides or
  // pops while the width animates. Without `rail` (the phone drawer) everything is always shown in full.
  const railOpen = hovered;
  function fadeClass(rail: boolean) {
    if (!rail) return "";
    return `transition-opacity duration-200 ease-out ${railOpen ? "opacity-100 delay-100" : "pointer-events-none opacity-0"}`;
  }

  function renderNav(rail: boolean) {
    const fade = fadeClass(rail);
    return (
      <nav className="flex flex-col gap-5" aria-label="Admin">
        {GROUPS.map((group, gi) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            {rail ? (
              <div className="relative mb-1 h-4">
                <p className={`absolute inset-x-0 top-0 px-3 text-[10.5px] font-medium tracking-[0.14em] uppercase text-muted-2 ${fade}`}>
                  {group.title}
                </p>
                {gi > 0 && (
                  <div
                    className={`absolute inset-x-3 top-1/2 h-px bg-border-soft transition-opacity duration-200 ${railOpen ? "opacity-0" : "opacity-100 delay-100"}`}
                  />
                )}
              </div>
            ) : (
              <p className="px-3 pb-1 text-[10.5px] font-medium tracking-[0.14em] uppercase text-muted-2">{group.title}</p>
            )}
            {group.items.map(({ href, label, icon: Icon, badge }) => {
              const active = pathname === href || pathname?.startsWith(`${href}/`);
              const count = badge ? badges[badge] : 0;
              return (
                <Link
                  key={href}
                  href={href}
                  title={rail && !railOpen ? label : undefined}
                  data-tour={`nav-${href}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={`group relative flex items-center gap-3 rounded-lg py-2 text-[14px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    rail ? "pl-[15px] pr-3" : "px-3"
                  } ${
                    active
                      ? "bg-primary/10 font-medium text-primary-dark"
                      : "text-muted-2 hover:bg-black/[0.04] hover:text-foreground"
                  }`}
                >
                  {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] animate-[admin-fade_300ms_ease-out] rounded-r-full bg-primary" />}
                  <span className="relative shrink-0">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.7} />
                    {rail && count > 0 && (
                      <span
                        className={`absolute -right-1.5 -top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-primary px-[3px] text-[8.5px] font-semibold leading-none text-white transition-opacity duration-150 ${
                          railOpen ? "opacity-0" : "opacity-100 delay-100"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  <span className={`truncate ${fade}`}>{label}</span>
                  {count > 0 && (
                    <span
                      className={`ml-auto grid h-[19px] min-w-[19px] place-items-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold tabular-nums text-white ${fade}`}
                    >
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

  function renderTourButton(rail: boolean) {
    return (
      <button
        type="button"
        onClick={() => {
          setDrawerOpen(false);
          window.dispatchEvent(new Event(TOUR_START_EVENT));
        }}
        title={rail && !railOpen ? "Take a tour" : undefined}
        aria-label="Take a tour"
        className={`flex w-full items-center gap-3 rounded-lg py-2 text-[13px] text-muted-2 transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          rail ? "pl-[15px] pr-3" : "px-3"
        }`}
      >
        <Compass className="h-[18px] w-[18px] shrink-0" />
        <span className={fadeClass(rail)}>Take a tour</span>
      </button>
    );
  }

  function renderUser(rail: boolean) {
    return (
      <div className={`flex items-center gap-3 ${rail ? "pl-[6px]" : ""}`}>
        <span
          title={rail && !railOpen ? (userName ?? "Admin") : undefined}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary-dark"
        >
          {initials(userName)}
        </span>
        <div className={`min-w-0 flex-1 leading-tight ${fadeClass(rail)}`}>
          <p className="truncate text-[13px] font-medium text-foreground">{userName ?? "Admin"}</p>
          <p className="text-[11.5px] text-muted-2">Administrator</p>
        </div>
        <Link
          href="/admin/account"
          title="Change password"
          aria-label="Change password"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${fadeClass(rail)}`}
        >
          <KeyRound className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Sign out"
          aria-label="Sign out"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${fadeClass(rail)}`}
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderBrand(rail: boolean) {
    return (
      <div className={`flex items-center gap-2.5 ${rail ? "pl-6" : ""}`}>
        <Logo variant="static" size={24} className="shrink-0 text-foreground" />
        <div className={`min-w-0 leading-tight ${fadeClass(rail)}`}>
          <p className="text-[15px] font-medium tracking-[-0.02em] text-foreground">Inzivo</p>
          <p className="truncate text-[11.5px] text-muted-2">{orgName ?? "Admin console"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-root flex h-screen overflow-hidden bg-surface text-foreground">
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
        onFocus={openNow}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeSoon();
        }}
        className={`hidden shrink-0 flex-col overflow-hidden whitespace-nowrap border-r border-border bg-surface-2 will-change-[width] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${
          hovered ? "w-[256px]" : "w-[72px]"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-border-soft">{renderBrand(true)}</div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5">{renderNav(true)}</div>

        <div className="shrink-0 border-t border-border-soft px-3 py-3">
          <div className="mb-1">{renderTourButton(true)}</div>
          <div className="mb-3">
            <ThemeToggle rail={{ open: hovered }} />
          </div>
          {renderUser(true)}
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
        <main className="admin-canvas flex-1 overflow-y-auto">
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
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
