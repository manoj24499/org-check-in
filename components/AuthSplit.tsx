import type { ReactNode } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";

export type AuthPanel = {
  eyebrow: string;
  title: ReactNode;
  text: string;
  bullets: string[];
};

export const ATTENDANCE_PANEL: AuthPanel = {
  eyebrow: "Inzivo",
  title: (
    <>
      Attendance that <span className="text-primary">proves itself.</span>
    </>
  ),
  text: "Geofenced, photo-verified check-in for every team, with one admin console behind it.",
  bullets: [
    "Photo-verified, geofenced check-in from your team's own phones",
    "Shifts, leave and overtime managed in one admin console",
    "Live field-team location and payroll-ready exports",
  ],
};

export const EMPLOYEE_PANEL: AuthPanel = {
  eyebrow: "Employee portal",
  title: (
    <>
      Your attendance, <span className="text-primary">at a glance.</span>
    </>
  ),
  text: "Check your hours, request leave and keep track of your shifts from one place.",
  bullets: [
    "See your check-ins and full attendance history",
    "Request leave and overtime in a couple of taps",
    "Know your shift and what's coming up",
  ],
};

/**
 * Shared frame for the sign-in family of pages (and account activation): a
 * plain white form column beside a calm dark brand panel. Deliberately quiet
 * — no decorative motion — so the form is the focus. The panel hides below
 * the lg breakpoint, leaving just the form on phones and tablets.
 */
export default function AuthSplit({
  children,
  panel = ATTENDANCE_PANEL,
  footer,
}: {
  children: ReactNode;
  panel?: AuthPanel;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-surface-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <div className="flex items-center gap-2.5 text-foreground">
          <Logo variant="static" size={28} />
          <span className="text-lg font-medium tracking-[-0.03em]">Inzivo</span>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">{children}</div>

        <p className="flex items-center gap-1.5 text-xs text-muted-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          {footer ?? "Geofenced, photo-verified, server-enforced attendance."}
        </p>
      </section>

      <aside className="relative hidden overflow-hidden bg-[#1d1f26] text-white lg:flex lg:flex-col lg:justify-between lg:p-16">
        <div
          aria-hidden
          className="absolute -bottom-40 -right-40 h-[34rem] w-[34rem] rounded-full bg-primary/25 blur-[120px]"
        />

        <div className="relative">
          <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-white/50">{panel.eyebrow}</p>
          <h2 className="mt-3 max-w-md text-[40px] font-medium leading-[1.1] tracking-[-0.03em]">{panel.title}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">{panel.text}</p>
        </div>

        <ul className="relative flex max-w-md flex-col gap-4">
          {panel.bullets.map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15px] leading-snug text-white/80">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
