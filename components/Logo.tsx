"use client";

import { useId } from "react";

interface LogoProps {
  /**
   * "animated" plays the one-shot build-in once on mount and holds its
   * settled state — use only for genuine once-per-view moments (the home
   * page hero). "static" (default) renders the settled mark directly with
   * no animation — use anywhere that remounts often (page headers/nav),
   * where replaying the build-in on every navigation would be distracting.
   */
  variant?: "animated" | "static";
  size?: number;
  className?: string;
}

/**
 * The Inzivo "Z-gate" mark: a top bar, a bottom bar, and an orange diagonal
 * stroke between them. Imported from the "Inzivo Z-gate — Animated" Claude
 * Design project; see app/globals.css for the logo-top/logo-bottom/logo-wipe
 * keyframes this uses in "animated" mode.
 */
export function Logo({ variant = "static", size = 24, className }: LogoProps) {
  const clipId = useId();
  const animated = variant === "animated";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 104 104"
      fill="none"
      className={className}
      role="img"
      aria-label="Inzivo"
    >
      {animated && (
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect
              x={0}
              y={-104}
              width={104}
              height={104}
              className="logo-anim-wipe"
              style={{ transform: "translateY(0)", animation: "logo-wipe 1.1s cubic-bezier(0.22,0.7,0.2,1) 1 forwards" }}
            />
          </clipPath>
        </defs>
      )}
      <rect
        x={16}
        y={16}
        width={72}
        height={14}
        fill="currentColor"
        className={animated ? "logo-anim-top" : undefined}
        style={
          animated
            ? { opacity: 0, transform: "translateX(-70px)", animation: "logo-top 1.1s cubic-bezier(0.2,0.8,0.2,1) 1 forwards" }
            : undefined
        }
      />
      <path
        d="M88 16 L38 88 H16 L66 16 Z"
        className="fill-primary"
        clipPath={animated ? `url(#${clipId})` : undefined}
      />
      <rect
        x={16}
        y={74}
        width={72}
        height={14}
        fill="currentColor"
        className={animated ? "logo-anim-bottom" : undefined}
        style={
          animated
            ? { opacity: 0, transform: "translateX(70px)", animation: "logo-bottom 1.1s cubic-bezier(0.2,0.8,0.2,1) 1 forwards" }
            : undefined
        }
      />
    </svg>
  );
}
