"use client";

import { useEffect } from "react";

/**
 * Next.js App Router convention: catches an uncaught render error anywhere
 * in this route segment (and everything nested under it) and swaps in this
 * UI instead of crashing to a blank white page. Without this file, Next's
 * own bare-bones default error screen is all a user sees — this is the only
 * project-styled recovery UI in the app, and previously didn't exist at any
 * level. Must be a Client Component (App Router requirement for error.tsx)
 * and, since it's a sibling of the root layout rather than inside it, a
 * thrown error here still keeps the rest of that layout (nav chrome, etc.)
 * mounted — only global-error.tsx (see that file) covers a crash in the
 * layout itself.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app/error.tsx] Uncaught render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-secondary">
          An unexpected error occurred. You can try again, or reload the page if it keeps happening.
        </p>
        {process.env.NODE_ENV !== "production" ? (
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-surface border border-border-soft p-3 text-left text-xs text-secondary whitespace-pre-wrap">
            {error.message}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
