"use client";

import { useEffect } from "react";

/**
 * Next.js App Router convention: the one error boundary that also covers a
 * crash in the root layout itself (app/layout.tsx) — app/error.tsx can't
 * catch that, since it renders as a sibling *inside* the layout, not around
 * it. Because this replaces the entire document when it triggers, it must
 * render its own <html>/<body> — none of the root layout's providers,
 * fonts, or global CSS classes can be assumed to be mounted, so this
 * deliberately uses plain inline styles rather than the Tailwind utility
 * classes the rest of the app uses.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/global-error.tsx] Uncaught error in root layout:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#e8eaf2",
          color: "#292b31",
          padding: 16,
        }}
      >
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#75798c" }}>
            The app failed to load. You can try again, or reload the page if it keeps happening.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: "1px solid #f06400",
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: "#c05000",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
