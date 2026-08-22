"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import SignOutButton from "./SignOutButton";
import AdminNav from "./AdminNav";

/**
 * The admin shell's header — logo, nav, and sign-out. Below 1220px the
 * inline nav (which used to just flex-wrap into 2-3 cramped rows, eating a
 * big chunk of the viewport before any page content showed) collapses
 * behind a hamburger toggle instead, opening a proper full-width dropdown
 * list of touch-sized rows.
 *
 * 1220px is a measured threshold, not one of this app's named breakpoints
 * (see app/globals.css's `--breakpoint-*`) — the full nav has 7 labels,
 * some multi-word ("Field workers", "Office location"), plus the
 * pending-leave badge, username, and sign-out button all sharing one row;
 * that combination only reliably fits above ~1120px (measured directly in
 * the browser), so 1220px leaves headroom for a longer admin name than
 * whatever was tested. `--breakpoint-lg` (1100px) is too narrow — it still
 * wraps. Above 1220px renders exactly as before: logo, inline nav, name +
 * sign-out, all in one row.
 */
export default function AdminHeader({
  userName,
  pendingLeaveCount,
}: {
  userName?: string | null;
  pendingLeaveCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-surface-2 shrink-0">
      <div className="flex items-center justify-between gap-4 px-5 py-3 sm:px-7 min-[1220px]:h-14">
        <div className="flex items-center gap-2 shrink-0">
          <Logo variant="static" size={18} className="text-foreground" />
          <span className="text-xs font-medium tracking-[0.12em] uppercase text-muted">
            Admin
          </span>
        </div>

        <div className="hidden min-[1220px]:flex min-[1220px]:flex-1 min-[1220px]:items-center min-[1220px]:gap-6">
          <AdminNav pendingLeaveCount={pendingLeaveCount} />
          <div className="flex items-center gap-3.5 ml-auto text-[13px] text-muted">
            <span>{userName}</span>
            <SignOutButton />
          </div>
        </div>

        <div className="flex items-center gap-1 min-[1220px]:hidden">
          <SignOutButton />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="p-2.5 -m-1 rounded-lg text-muted hover:bg-surface transition-colors"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="min-[1220px]:hidden border-t border-border-soft px-5 py-3 sm:px-7">
          <AdminNav
            pendingLeaveCount={pendingLeaveCount}
            stacked
            onNavigate={() => setOpen(false)}
          />
          {userName && (
            <p className="mt-2 pt-2 border-t border-border-soft text-xs text-muted px-3">
              Signed in as {userName}
            </p>
          )}
        </div>
      )}

      <div className="fade-rule" />
    </header>
  );
}
