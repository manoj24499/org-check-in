"use client";

// Applies the admin console's saved (or system) theme before first paint so a
// dark-mode admin never sees a flash of light. Only sets an attribute on
// <html>; styling is scoped to .admin-root (see globals.css). Toggled in
// components/ThemeToggle.tsx.
//
// React 19 warns whenever it *client*-renders an executable <script> ("Scripts
// inside React components are never executed..."), which happens to the root
// layout during dev error recovery even when it is a server component. So the
// server HTML gets an executable script (runs during parsing, before paint),
// and any client render gets type="text/plain" — a data block React doesn't
// warn about. The script has already run by then, so nothing is lost;
// suppressHydrationWarning covers the attribute difference during hydration.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("admin_theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-admin-theme",t)}catch(e){}})()`;

export default function ThemeInitScript() {
  return (
    <script
      id="admin-theme-init"
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT }}
    />
  );
}
