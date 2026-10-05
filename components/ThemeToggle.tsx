"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "admin_theme";
const CHANGE_EVENT = "admin-theme-change";

type Theme = "light" | "dark";

// The theme lives on <html data-admin-theme>, set before first paint by the
// inline script in app/admin/layout.tsx (so a returning dark-mode user never
// sees a flash of light). This store just mirrors that attribute.
function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}
function getTheme(): Theme {
  return document.documentElement.getAttribute("data-admin-theme") === "dark" ? "dark" : "light";
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  const isDark = theme === "dark";

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-admin-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the theme still switches, it just won't be remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggle}
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-2 transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      <span>{isDark ? "Dark theme" : "Light theme"}</span>
      <span
        className={`relative ml-auto h-5 w-9 shrink-0 rounded-full transition-colors ${isDark ? "bg-orange-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#ffffff] shadow transition-all ${isDark ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
