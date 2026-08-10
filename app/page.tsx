import Link from "next/link";
import { Building2, Fingerprint, LogIn, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col bg-background">
      <div className="flex items-center gap-2 px-6 sm:px-9 h-14 sm:h-[68px] shrink-0">
        <Building2 className="w-5 h-5 text-primary" />
        <span className="text-[13px] font-medium tracking-[0.12em] uppercase text-muted">
          Qube Space
        </span>
        <span className="ml-auto text-[13px] text-muted hidden sm:inline">
          Internal use only
        </span>
      </div>
      <div className="fade-rule shrink-0" />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 px-6 sm:px-9 py-10 sm:py-14 max-w-6xl mx-auto w-full">
        <div className="flex flex-col justify-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-[22px] h-[2px] bg-primary block" />
            <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
              Attendance portal
            </span>
          </div>
          <h1 className="text-[40px] sm:text-[56px] leading-[1.05] tracking-[-0.03em] font-medium text-foreground">
            Check in.
            <br />
            Check out.
            <br />
            <span className="text-muted">That&apos;s it.</span>
          </h1>
          <p className="max-w-[44ch] text-[15px] sm:text-base leading-relaxed text-muted">
            Presence photo, geofence and live location for the whole
            organisation — one shared device, one PIN, no paperwork.
          </p>
          <div className="flex flex-wrap gap-3 mt-1.5">
            <Link
              href="/kiosk"
              className="inline-flex items-center gap-2 rounded-lg border border-primary px-4 py-2.5 text-sm font-medium text-primary-dark hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Fingerprint className="w-4 h-4" />
              Check In / Out
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-2 hover:bg-black/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <LogIn className="w-4 h-4" />
              Login
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3">
          <div className="rounded-lg border border-border bg-surface-2 px-5 py-4 shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                <Fingerprint className="w-[18px] h-[18px]" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  One shared kiosk
                </div>
                <div className="text-[13px] text-muted">
                  Employee ID + PIN, presence photo, geofence check
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-5 py-4 shadow-[0_1px_2px_rgba(41,43,49,0.05)]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
                <ShieldCheck className="w-[18px] h-[18px]" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  Admin oversight
                </div>
                <div className="text-[13px] text-muted">
                  Live dashboard, employee roster, office geofencing
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted pb-6">
        Qube Space &middot; Employee Portal
      </p>
    </main>
  );
}
