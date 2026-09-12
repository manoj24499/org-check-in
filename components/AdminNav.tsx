"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/field-workers", label: "Field workers" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/shifts", label: "Shifts" },
  { href: "/admin/leave", label: "Leave" },
  { href: "/admin/overtime", label: "Overtime" },
  { href: "/admin/office-location", label: "Office location" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav({
  pendingLeaveCount = 0,
  pendingOvertimeCount = 0,
  pendingSupportCount = 0,
  stacked = false,
  onNavigate,
}: {
  pendingLeaveCount?: number;
  pendingOvertimeCount?: number;
  pendingSupportCount?: number;
  /** Vertical, full-width, touch-sized rows — used in the mobile dropdown
   * (see AdminHeader) instead of the horizontal-wrap layout desktop uses. */
  stacked?: boolean;
  /** Fired when a link is tapped — lets AdminHeader close the mobile
   * dropdown on navigation, since a Link click doesn't unmount this component. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const badgeCountFor: Record<string, number> = {
    "/admin/leave": pendingLeaveCount,
    "/admin/overtime": pendingOvertimeCount,
    "/admin/support": pendingSupportCount,
  };

  return (
    <nav className={stacked ? "flex flex-col gap-1" : "flex items-center gap-4 flex-wrap"}>
      {LINKS.map(({ href, label }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={
              stacked
                ? `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active ? "bg-primary/10 font-medium text-primary" : "text-muted hover:bg-surface"
                  }`
                : `inline-flex items-center gap-1.5 text-sm transition-colors ${
                    active ? "font-medium text-foreground" : "text-muted hover:text-foreground"
                  }`
            }
          >
            {!stacked && <span className={`w-3.5 h-[2px] block ${active ? "bg-primary" : "bg-transparent"}`} />}
            {label}
            {(badgeCountFor[href] ?? 0) > 0 ? (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-semibold tabular-nums ${
                  stacked ? "ml-auto" : ""
                }`}
              >
                {badgeCountFor[href]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
