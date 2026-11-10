import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CircleCheck,
  Fingerprint,
  KeyRound,
  LogIn,
  MapPin,
  Radar,
  ShieldCheck,
  User,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const FEATURES = [
  { icon: Camera, label: "Presence photo" },
  { icon: MapPin, label: "Geofence check" },
  { icon: Radar, label: "Live location" },
];

const STEPS = [
  { icon: KeyRound, title: "Enter your PIN", body: "Everyone uses the same shared device. Your PIN says who you are." },
  { icon: Camera, title: "Photo and place verified", body: "A quick presence photo and a geofence check confirm you are on site." },
  { icon: CircleCheck, title: "You're checked in", body: "Your time is logged straight away and shows up for your admin." },
];

const CORNERS = [
  "left-2.5 top-2.5 rounded-tl-lg border-l-2 border-t-2",
  "right-2.5 top-2.5 rounded-tr-lg border-r-2 border-t-2",
  "bottom-2.5 left-2.5 rounded-bl-lg border-b-2 border-l-2",
  "bottom-2.5 right-2.5 rounded-br-lg border-b-2 border-r-2",
];

const CHIP =
  "lp-float absolute z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11.5px] font-medium text-foreground shadow-[0_10px_24px_-10px_rgba(41,43,49,0.4)]";

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background lg:h-dvh">
      {/* Backdrop: faint grid + warm glow behind the kiosk preview */}
      <div className="lp-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -right-32 top-4 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(240,100,0,0.22),transparent_65%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-40 bottom-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(240,100,0,0.08),transparent_65%)]"
        aria-hidden
      />

      <header className="relative mx-auto flex h-14 w-full max-w-6xl shrink-0 items-center gap-2.5 px-6 sm:px-9">
        <Logo variant="animated" size={24} className="text-foreground" />
        <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground">Inzivo</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[12px] text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Internal use only
        </span>
      </header>

      <section className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-6 py-6 sm:px-9 lg:min-h-0 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:py-2">
        <div className="flex flex-col gap-5">
          <div className="lp-rise inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-dark">Attendance portal</span>
          </div>
          <h1
            className="lp-rise text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground sm:text-[60px] lg:text-[clamp(48px,8.2vh,68px)]"
            style={{ animationDelay: "80ms" }}
          >
            Check in.
            <br />
            Check out.
            <br />
            <span className="text-primary">That&apos;s it.</span>
          </h1>
          <p
            className="lp-rise max-w-[46ch] text-[15px] leading-relaxed text-muted sm:text-[17px]"
            style={{ animationDelay: "160ms" }}
          >
            Presence photo, geofence and live location for the whole organisation, from one shared device with one PIN.
          </p>

          <div className="lp-rise flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Link
              href="/kiosk"
              className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-primary px-6 text-[15px] font-medium text-white shadow-[0_14px_28px_-12px_rgba(240,100,0,0.85)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-dark active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Fingerprint className="h-5 w-5" />
              Check in / out
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-6 text-[15px] font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <LogIn className="h-5 w-5" />
              Admin login
            </Link>
          </div>

          <ul className="lp-rise flex flex-wrap gap-2" style={{ animationDelay: "320ms" }}>
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
        <div className="lp-rise relative mx-auto w-full max-w-[400px] px-6 py-6" style={{ animationDelay: "200ms" }} aria-hidden>
          <span className={`${CHIP} -left-2 top-[22%] sm:-left-6`}>
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Inside geofence
          </span>
          <span className={`${CHIP} -right-1 top-0 sm:-right-5`} style={{ animationDuration: "7.5s" }}>
            <Radar className="h-3.5 w-3.5 text-primary" />
            Live location on
          </span>

          <div className="lp-float relative rounded-[28px] border border-border bg-surface-2 p-5 shadow-[0_32px_64px_-28px_rgba(41,43,49,0.5)]">
            <div className="mb-4 flex items-center justify-between text-[12px] text-muted">
              <span className="font-medium text-foreground">Shared kiosk</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Ready
              </span>
            </div>

            <div className="relative mb-4 flex h-[clamp(130px,21vh,190px)] items-center justify-center overflow-hidden rounded-2xl bg-surface">
              {CORNERS.map((c) => (
                <span key={c} className={`absolute h-5 w-5 border-primary/70 ${c}`} />
              ))}
              <div className="lp-ring relative grid h-[104px] w-[104px] place-items-center rounded-full border-2 border-primary text-primary">
                <User className="h-10 w-10" />
              </div>
              <div className="lp-scan absolute left-4 right-4 h-0.5 rounded-full bg-primary/70 shadow-[0_0_14px_2px_rgba(240,100,0,0.35)]" />
            </div>

            <div className="mb-4 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="lp-dot h-3 w-3 rounded-full border-[1.5px] border-border" />
              ))}
            </div>

            <div className="lp-result flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-emerald-700">
              <CircleCheck className="h-6 w-6 shrink-0" />
              <div className="leading-tight">
                <p className="text-sm font-semibold">Checked in</p>
                <p className="text-[11.5px] opacity-80">9:02 AM · Inside office</p>
              </div>
            </div>
          </div>

          <span
            className={`${CHIP} -right-2 bottom-[9%] sm:-right-6`}
            style={{ animationDirection: "reverse", animationDuration: "7s" }}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Photo verified
          </span>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl shrink-0 px-6 pb-3 sm:px-9">
        <ol className="lp-rise grid gap-3 sm:grid-cols-3" style={{ animationDelay: "380ms" }}>
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="flex gap-3.5 rounded-2xl border border-border bg-surface-2 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-dark">Step {i + 1}</p>
                <p className="mt-0.5 text-[14.5px] font-medium text-foreground">{title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="relative shrink-0 pb-4 text-center text-xs text-muted">Inzivo &middot; Employee Portal</p>
    </main>
  );
}
