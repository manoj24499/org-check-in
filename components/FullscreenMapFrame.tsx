"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Wraps a map so it can fill the whole screen. Uses the browser Fullscreen API, which puts the map in the
 * top layer above the sidebar and header (a fixed overlay got buried under their stacking contexts); where
 * that isn't available (iOS Safari) it falls back to a fixed overlay. Esc or the button leaves it. The map is
 * told to re-measure itself afterwards (Leaflet listens for window resize).
 */
export default function FullscreenMapFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  /** Sizing classes used in the normal (inline) state, e.g. "h-[480px]". */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [fallback, setFallback] = useState(false);

  const resizeSoon = () => {
    for (const ms of [60, 300]) setTimeout(() => window.dispatchEvent(new Event("resize")), ms);
  };

  useEffect(() => {
    const onChange = () => {
      setFull(document.fullscreenElement === ref.current);
      resizeSoon();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!fallback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFallback(false);
        resizeSoon();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fallback]);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (fallback) {
      setFallback(false);
      resizeSoon();
      return;
    }
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // fall through to the overlay
      }
    }
    setFallback(true);
    resizeSoon();
  }, [fallback]);

  const isFull = full || fallback;

  return (
    <div
      ref={ref}
      className={`relative bg-background ${fallback ? "fixed inset-0 z-[99999] p-2" : full ? "p-2" : className}`}
      style={full ? { width: "100vw", height: "100vh" } : undefined}
    >
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        {children}
        <button
          type="button"
          onClick={toggle}
          aria-label={isFull ? "Exit full screen" : "View map full screen"}
          title={isFull ? "Exit full screen (Esc)" : "Full screen"}
          className="absolute right-[10px] top-[54px] z-[999] grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50"
        >
          {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
