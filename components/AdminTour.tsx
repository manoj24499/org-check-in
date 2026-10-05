"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarOff,
  Check,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MapPinned,
  Rocket,
  Settings,
  Sparkles,
  Timer,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

/** Fired by the sidebar's "Take a tour" button (and anything else) to (re)start the tour. */
export const TOUR_START_EVENT = "admin-tour-start";

const DONE_KEY = "admin_tour_done";

type Step = {
  /** Sidebar link to spotlight (matches data-tour="nav-<href>"); omitted = centred card. */
  target?: string;
  /** Page to show behind the tour for this step. */
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  points?: string[];
};

const STEPS: Step[] = [
  {
    href: "/admin/dashboard",
    icon: Sparkles,
    eyebrow: "Welcome",
    title: "Welcome to your admin console",
    body: "Here is a quick two-minute walk through each section, so you know where everything lives. You can leave at any time and restart it from the sidebar.",
  },
  {
    target: "/admin/dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    eyebrow: "Overview",
    title: "Dashboard: today at a glance",
    body: "Your daily home. See who is in, late, absent or on leave the moment you open it.",
    points: [
      "Live counts and a team-today table you can filter",
      "See who has not checked in yet",
      "Approve or decline permission requests inline",
    ],
  },
  {
    target: "/admin/employees",
    href: "/admin/employees",
    icon: Users,
    eyebrow: "Workforce",
    title: "Employees: your team",
    body: "Everyone who can check in lives here. Start by adding your team.",
    points: [
      "Add one person, or upload a CSV to add up to 500",
      "Set each person's mode: Office, Work from home or Field",
      "Open a profile for attendance history and PIN reset",
    ],
  },
  {
    target: "/admin/field-workers",
    href: "/admin/field-workers",
    icon: MapPinned,
    eyebrow: "Workforce",
    title: "Field workers: people on the move",
    body: "For employees who work outside the office, see where they have been without geofencing them.",
    points: ["Review the places each field employee visited", "Pick any date to look back"],
  },
  {
    target: "/admin/shifts",
    href: "/admin/shifts",
    icon: CalendarClock,
    eyebrow: "Workforce",
    title: "Shifts: set working hours",
    body: "Create the shifts your team works. Attendance and lateness are measured against them.",
    points: ["Create shifts with start and end times", "Assign employees to the right shift"],
  },
  {
    target: "/admin/leave",
    href: "/admin/leave",
    icon: CalendarOff,
    eyebrow: "Requests",
    title: "Leave: requests and holidays",
    body: "Everything about time off, in one place.",
    points: [
      "Approve or decline leave requests",
      "Mark leave on someone's behalf",
      "Maintain your company holiday calendar",
    ],
  },
  {
    target: "/admin/overtime",
    href: "/admin/overtime",
    icon: Timer,
    eyebrow: "Requests",
    title: "Overtime: extra hours, tracked",
    body: "See who is working overtime right now, and review completed sessions with their work summaries and photos.",
  },
  {
    target: "/admin/support",
    href: "/admin/support",
    icon: LifeBuoy,
    eyebrow: "Requests",
    title: "Support: employee issues",
    body: "When someone reports wrong hours or a geofence problem from the app, it lands here so you can resolve it.",
  },
  {
    target: "/admin/office-location",
    href: "/admin/office-location",
    icon: MapPin,
    eyebrow: "Workspace",
    title: "Office location: set this first",
    body: "Employees must check in within the allowed radius of your office. Pin the location on the map and choose a radius.",
    points: ["Search or drop a pin on your office", "Adjust the allowed check-in radius"],
  },
  {
    target: "/admin/settings",
    href: "/admin/settings",
    icon: Settings,
    eyebrow: "Workspace",
    title: "Settings: tune your workspace",
    body: "Everything that shapes how Inzivo behaves for your company.",
    points: [
      "Leave quotas, lateness threshold and reimbursement rate",
      "Your org code, plan and seats",
      "Other admins and API keys",
    ],
  },
];

const CHECKLIST = [
  { href: "/admin/office-location", label: "Set your office location", hint: "Needed before anyone can check in", icon: MapPin },
  { href: "/admin/employees", label: "Add your team", hint: "One by one or upload a CSV", icon: Users },
  { href: "/admin/shifts", label: "Create your shifts", hint: "Set working hours", icon: CalendarClock },
];

const TOTAL = STEPS.length + 1; // + the final "get started" card

type Box = { top: number; left: number; width: number; height: number };
type Placement = { box: Box | null; vw: number; vh: number };

const CARD_W = 372;
const PAD = 6;

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Storage blocked: the tour may offer itself again next visit.
  }
}

/** First visible match (the desktop sidebar and the mobile drawer both render the nav). */
function findTarget(href: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="nav-${href}"]`);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * First-run product tour for a new organisation admin. A dimmed overlay with a
 * gliding spotlight walks the sidebar section by section, loading each page
 * behind the card so the admin sees the real screen being described. Starts
 * once automatically on the dashboard (remembered per browser), and can be
 * replayed from the sidebar at any time. Below lg there is no visible sidebar
 * to point at, so the card is simply centred.
 */
export default function AdminTour({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [idx, setIdx] = useState<number | null>(null);
  const [place, setPlace] = useState<Placement>({ box: null, vw: 0, vh: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const measure = useCallback((i: number | null) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const step = i === null ? undefined : STEPS[i];
    const el = step?.target ? findTarget(step.target) : null;
    if (!el) {
      setPlace({ box: null, vw, vh });
      return;
    }
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    setPlace({ box: { top: r.top, left: r.left, width: r.width, height: r.height }, vw, vh });
  }, []);

  const go = useCallback(
    (i: number) => {
      setIdx(i);
      const step = STEPS[i];
      if (step) router.push(step.href);
      // Measure after the scrollIntoView / layout settles.
      requestAnimationFrame(() => measure(i));
    },
    [router, measure],
  );

  const close = useCallback(() => {
    markDone();
    setIdx(null);
  }, []);

  // Auto-start once, on the dashboard, for an admin who hasn't seen it.
  useEffect(() => {
    if (idx !== null || pathname !== "/admin/dashboard") return;
    let seen = true;
    try {
      seen = localStorage.getItem(DONE_KEY) === "1";
    } catch {
      seen = true; // can't remember it, so don't nag
    }
    if (seen) return;
    const t = window.setTimeout(() => go(0), 900);
    return () => window.clearTimeout(t);
  }, [pathname, idx, go]);

  // Replay from the sidebar.
  useEffect(() => {
    const start = () => go(0);
    window.addEventListener(TOUR_START_EVENT, start);
    return () => window.removeEventListener(TOUR_START_EVENT, start);
  }, [go]);

  // Keep the spotlight on its target through resizes, and handle the keyboard.
  useEffect(() => {
    if (idx === null) return;
    const onResize = () => measure(idx);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") {
        if (idx < TOTAL - 1) go(idx + 1);
        else close();
      } else if (e.key === "ArrowLeft" && idx > 0) go(idx - 1);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [idx, measure, go, close]);

  // Move focus into the card on each step so the keyboard works immediately.
  useEffect(() => {
    if (idx !== null) nextRef.current?.focus({ preventScroll: true });
  }, [idx]);

  if (idx === null) return null;

  const isFinal = idx === STEPS.length;
  const step = isFinal ? null : STEPS[idx];
  const { box, vw, vh } = place;
  const first = (userName ?? "").trim().split(/\s+/)[0];

  // Card sits to the right of the spotlit link; centred when there is none.
  let cardStyle: React.CSSProperties;
  let arrowTop: number | null = null;
  if (box && vw >= 1024) {
    const maxTop = Math.max(16, vh - 420);
    const top = Math.min(Math.max(16, box.top + box.height / 2 - 70), maxTop);
    cardStyle = { top, left: Math.min(box.left + box.width + PAD + 18, vw - CARD_W - 16), width: CARD_W };
    arrowTop = box.top + box.height / 2 - top;
  } else {
    cardStyle = {
      top: "50%",
      left: "50%",
      width: Math.min(CARD_W + 28, Math.max(280, vw - 32)),
      transform: "translate(-50%, -50%)",
    };
  }

  const Icon = step?.icon ?? Rocket;
  const eyebrow = step?.eyebrow ?? "All set";
  const title = isFinal ? "You're ready to go" : idx === 0 && first ? `Welcome, ${first}` : step!.title;

  return (
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="Admin console tour">
      {/* Click shield: the tour owns the screen until closed. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Dim + spotlight. With no target the whole screen is simply dimmed. */}
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(8,12,24,0.62), 0 0 0 2px var(--color-primary, #ea580c)",
          }}
        >
          <span className="tour-pulse absolute inset-0 rounded-xl" />
        </div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#080c18]/60" />
      )}

      <div
        key={idx}
        ref={cardRef}
        style={cardStyle}
        className="tour-card absolute rounded-2xl border border-border bg-surface-2 p-5 shadow-2xl"
      >
        {arrowTop !== null && (
          <span
            aria-hidden
            className="absolute -left-[7px] h-3.5 w-3.5 rotate-45 border-b border-l border-border bg-surface-2"
            style={{ top: Math.max(18, arrowTop) - 7 }}
          />
        )}

        <button
          type="button"
          onClick={close}
          aria-label="Close tour"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted-2 transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary-dark">
            <Icon className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-2">{eyebrow}</p>
            <h2 className="text-[16px] font-medium leading-snug tracking-[-0.01em] text-foreground">{title}</h2>
          </div>
        </div>

        {isFinal ? (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-2">
              That&apos;s the whole console. Three things to do first, in this order:
            </p>
            <ol className="mt-3 flex flex-col gap-2">
              {CHECKLIST.map((c, n) => (
                <li key={c.href}>
                  <Link
                    href={c.href}
                    onClick={close}
                    className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[12px] font-semibold text-primary-dark">
                      {n + 1}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[13.5px] font-medium text-foreground">{c.label}</span>
                      <span className="block text-[12px] text-muted-2">{c.hint}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-dark" />
                  </Link>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-2">{step!.body}</p>
            {step!.points && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {step!.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-[13px] leading-snug text-foreground">
                    <span className="mt-[2px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/12 text-primary-dark">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {/* Progress + controls */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1" aria-label={`Step ${idx + 1} of ${TOTAL}`}>
            {Array.from({ length: TOTAL }).map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => go(n)}
                aria-label={`Go to step ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  n === idx ? "w-5 bg-primary" : n < idx ? "w-1.5 bg-primary/45" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button
                type="button"
                onClick={() => go(idx - 1)}
                aria-label="Previous step"
                className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-2 transition-colors hover:bg-black/[0.04] hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (isFinal ? close() : go(idx + 1))}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
            >
              {isFinal ? "Finish" : idx === 0 ? "Start tour" : "Next"}
              {!isFinal && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {!isFinal && (
          <button
            type="button"
            onClick={close}
            className="mt-3 w-full text-center text-[12px] text-muted-2 transition-colors hover:text-foreground"
          >
            Skip tour
          </button>
        )}
      </div>
    </div>
  );
}
