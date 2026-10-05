import type { ReactNode } from "react";
import { Camera, Check, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

/**
 * Shared frame for the standalone auth pages (forgot / reset password): a
 * geofence "radar" backdrop — rings, a sweeping scan, pulse and employees
 * blipping in, plus status chips on large screens — behind a frosted card.
 * Pure CSS (keyframes in app/globals.css); reduced-motion freezes it.
 */

const BLIPS = [
  { top: "24%", left: "62%", delay: "0s" },
  { top: "38%", left: "30%", delay: "0.9s" },
  { top: "66%", left: "70%", delay: "1.7s" },
  { top: "72%", left: "36%", delay: "2.6s" },
  { top: "30%", left: "46%", delay: "3.3s" },
  { top: "56%", left: "22%", delay: "4.1s" },
  { top: "50%", left: "78%", delay: "1.2s" },
];

const CHIPS = [
  { icon: MapPin, text: "Inside geofence · HQ", pos: "left-[5%] top-[22%]", delay: "0s" },
  { icon: Camera, text: "Photo verified", pos: "right-[6%] top-[30%]", delay: "3s" },
  { icon: Check, text: "Checked in · 9:02 AM", pos: "left-[8%] bottom-[22%]", delay: "6s" },
  { icon: Navigation, text: "Field visit · 3 stops", pos: "right-[7%] bottom-[20%]", delay: "9s" },
];

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_45%,rgba(240,100,0,0.10),transparent_70%)]" />

      <div
        className="auth-grid absolute inset-0"
        style={{
          maskImage: "radial-gradient(70% 70% at 50% 45%, #000 20%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(70% 70% at 50% 45%, #000 20%, transparent 100%)",
        }}
      />

      <div className="absolute left-1/2 top-[46%] aspect-square w-[min(140vw,860px)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-[0%] rounded-full border border-border" />
        <div className="absolute inset-[16%] rounded-full border border-border" />
        <div className="auth-ring-spin absolute inset-[32%] rounded-full border border-dashed border-primary/40" />
        <div className="absolute inset-[46%] rounded-full border border-primary/30" />

        <div
          className="auth-sweep absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 280deg, rgba(240,100,0,0.12) 350deg, rgba(240,100,0,0.32) 360deg)",
            maskImage: "radial-gradient(circle, #000 0%, #000 68%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, #000 0%, #000 68%, transparent 70%)",
          }}
        />

        <div className="auth-pulse absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2 border-primary/50" />
        <div
          className="auth-pulse absolute left-1/2 top-1/2 h-24 w-24 rounded-full border-2 border-primary/40"
          style={{ animationDelay: "1.3s" }}
        />

        {BLIPS.map((b, i) => (
          <span
            key={i}
            className="auth-blip absolute h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(240,100,0,0.12)]"
            style={{ top: b.top, left: b.left, animationDelay: b.delay }}
          />
        ))}
      </div>

      {CHIPS.map(({ icon: Icon, text, pos, delay }) => (
        <div
          key={text}
          className={`auth-chip absolute ${pos} hidden items-center gap-2 rounded-full border border-border bg-surface-2/90 py-2 pl-2.5 pr-4 text-[13px] font-medium text-foreground shadow-[0_10px_30px_-12px_rgba(41,43,49,0.25)] backdrop-blur lg:flex`}
          style={{ animationDelay: delay }}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {text}
        </div>
      ))}
    </div>
  );
}

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <Backdrop />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="flex flex-col rounded-lg border border-border bg-surface-2/85 p-7 shadow-[0_30px_70px_-30px_rgba(41,43,49,0.35)] backdrop-blur-xl sm:p-9">
          <div className="flex items-center gap-3 text-foreground">
            <Logo variant="animated" size={32} />
            <span className="text-xl font-medium tracking-[-0.03em]">Inzivo</span>
          </div>
          {children}
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Geofenced, photo-verified, server-enforced attendance
        </p>
      </div>
    </main>
  );
}
