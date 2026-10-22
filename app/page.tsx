import Link from "next/link";
import { ArrowRight, Camera, CircleCheck, Fingerprint, LogIn, MapPin, Radar, ShieldCheck, User } from "lucide-react";
import { Logo } from "@/components/Logo";

const FEATURES = [
  { icon: Camera, label: "Presence photo" },
  { icon: MapPin, label: "Geofence check" },
  { icon: Radar, label: "Live location" },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Backdrop: faint grid + orange glow behind the kiosk preview */}
      <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -right-24 -top-20 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(240,100,0,0.2),transparent_65%)]"
        aria-hidden
      />

      <div className="relative flex h-14 shrink-0 items-center gap-2 px-6 sm:h-[68px] sm:px-9">
        <Logo variant="animated" size={22} className="text-foreground" />
        <span className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted">Inzivo</span>
        <span className="ml-auto hidden text-[13px] text-muted sm:inline">Internal use only</span>
      </div>
      <div className="fade-rule relative shrink-0" />

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-6 py-10 sm:px-9 sm:py-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-5">
          <div className="lp-rise flex items-center gap-2">
            <span className="block h-[2px] w-[22px] bg-primary" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary-dark">Attendance portal</span>
          </div>
          <h1
            className="lp-rise text-[40px] font-medium leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[56px]"
            style={{ animationDelay: "80ms" }}
          >
            Check in.
            <br />
            Check out.
            <br />
            <span className="text-muted">That&apos;s it.</span>
          </h1>
          <p
            className="lp-rise max-w-[44ch] text-[15px] leading-relaxed text-muted sm:text-base"
            style={{ animationDelay: "160ms" }}
          >
            Presence photo, geofence and live location for the whole organisation, from one shared device with one PIN.
          </p>

          <div className="lp-rise mt-1.5 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link
              href="/kiosk"
              className="group inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-white shadow-[0_10px_22px_-10px_rgba(240,100,0,0.8)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-dark active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Fingerprint className="h-[18px] w-[18px]" />
              Check in / out
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-5 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <LogIn className="h-[18px] w-[18px]" />
              Admin login
            </Link>
          </div>

          <ul className="lp-rise mt-2 flex flex-wrap gap-2" style={{ animationDelay: "320ms" }}>
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] text-muted-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary-dark"
              >
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Decorative kiosk preview (sample data, not live) */}
        <div className="lp-rise relative flex justify-center py-6" style={{ animationDelay: "200ms" }} aria-hidden>
          <span className="lp-float absolute left-[2%] top-[18%] inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11.5px] text-foreground shadow-[0_8px_20px_-10px_rgba(41,43,49,0.35)]">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Inside geofence
          </span>
          <div className="lp-float w-[270px] rounded-[22px] border border-border bg-surface-2 p-4 shadow-[0_24px_50px_-24px_rgba(41,43,49,0.4)]">
            <div className="mb-3 flex items-center justify-between text-[11px] text-muted">
              <span>Shared kiosk</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Ready
              </span>
            </div>
            <div className="relative mb-3 flex h-[130px] items-center justify-center overflow-hidden rounded-2xl bg-surface">
              <div className="lp-ring relative grid h-[84px] w-[84px] place-items-center rounded-full border-2 border-primary text-primary">
                <User className="h-8 w-8" />
              </div>
              <div className="lp-scan absolute left-0 right-0 h-0.5 bg-primary/70" />
            </div>
            <div className="mb-3 flex justify-center gap-2.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="lp-dot h-[11px] w-[11px] rounded-full border-[1.5px] border-border" />
              ))}
            </div>
            <div className="lp-result flex items-center gap-2.5 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-emerald-700">
              <CircleCheck className="h-5 w-5" />
              <div className="leading-tight">
                <p className="text-[13px] font-medium">Checked in</p>
                <p className="text-[11px] opacity-80">9:02 AM · Inside office</p>
              </div>
            </div>
          </div>
          <span
            className="lp-float absolute bottom-[14%] right-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11.5px] text-foreground shadow-[0_8px_20px_-10px_rgba(41,43,49,0.35)]"
            style={{ animationDirection: "reverse", animationDuration: "7s" }}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Photo verified
          </span>
        </div>
      </div>

      <p className="relative pb-6 text-center text-xs text-muted">Inzivo &middot; Employee Portal</p>
    </main>
  );
}
