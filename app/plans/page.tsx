import Link from "next/link";
import { ArrowRight, LogIn, Building2, ShieldAlert, Check } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { trialState, TRIAL_DAYS, TRIAL_EMPLOYEE_LIMIT } from "@/lib/trial";
import { computeQuote, isQuoteError } from "@/lib/billing/quote";
import { CURRENCY_SYMBOL } from "@/lib/billing/plans";
import PlansShell from "./PlansShell";
import { PAID_PLANS } from "@/lib/billing/plans";
import { MARKETING_SITE_URL } from "@/lib/marketingSiteUrl";
import PlanChangeForm from "./PlanChangeForm";

const PLAN_IDS = PAID_PLANS.map((p) => p.id);

function sanitizePlan(raw: string | undefined): string {
  return raw && PLAN_IDS.includes(raw) ? raw : "growth";
}

function sanitizeCycle(raw: string | undefined): "monthly" | "annual" {
  return raw === "monthly" ? "monthly" : "annual";
}

function sanitizeSeats(raw: string | undefined, planId: string): number {
  const plan = PAID_PLANS.find((p) => p.id === planId)!;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : plan.minSeats;
}

type SearchParams = { plan?: string; cycle?: string; seats?: string; pv?: string };

function currentUrl(params: SearchParams): string {
  const qs = new URLSearchParams();
  if (params.plan) qs.set("plan", params.plan);
  if (params.cycle) qs.set("cycle", params.cycle);
  if (params.seats) qs.set("seats", params.seats);
  const query = qs.toString();
  return `/plans${query ? `?${query}` : ""}`;
}

/**
 * The one entry point for "customize a plan" from the marketing site's
 * pricing page (see inzivo-website/lib/links.ts's plansUrl) — branches on
 * whether the visitor is already a signed-in admin, since that determines
 * what "select features and see the price" actually leads to:
 *
 * - Signed in as an admin: change THEIR OWN organization's plan/seats (see
 *   PlanChangeForm + lib/billing/planChange.ts) — works the same whether
 *   their org is currently on the free trial or already paying.
 * - Not signed in: a choice, not a forced sign-in — some visitors here are
 *   an existing customer on a new device, but most are a brand-new
 *   prospect who has never had an account and would otherwise be locked
 *   out of self-serve signup entirely. Plan/cycle/seats are preserved
 *   either way.
 * - Signed in as an employee (not an admin): plan changes are an admin-only
 *   action; nothing here provisions or charges anything for them.
 */
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const plan = sanitizePlan(params.plan);
  const cycle = sanitizeCycle(params.cycle);
  const seats = sanitizeSeats(params.seats, plan);

  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN" && Boolean(session.user.organizationId);

  if (isAdmin) {
    // findUnique, not findUniqueOrThrow — a session can outlive the
    // organization it points at (a stale cookie from a deleted account is
    // the only realistic way this happens), and that's a sign-in problem
    // to surface plainly, not a 500.
    const organization = await prisma.organization.findUnique({
      where: { id: session!.user.organizationId! },
      select: { name: true, planTier: true, seatLimit: true, isTrial: true, trialEndsAt: true },
    });
    if (!organization) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8 text-center">
            <Logo variant="static" size={20} className="text-foreground mb-5 self-center" />
            <h1 className="text-[22px] font-medium tracking-[-0.025em] text-foreground">Session out of date</h1>
            <p className="mt-2 text-sm text-muted">Please sign in again to continue.</p>
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(currentUrl(params))}`}
              className="mt-5 self-center rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 px-4 text-sm font-medium hover:bg-primary/5 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </main>
      );
    }
    const t = trialState(organization);
    return (
      <PlanChangeForm
        initialPlan={plan}
        initialCycle={cycle}
        initialSeats={seats}
        organizationName={organization.name}
        currentPlanId={organization.planTier}
        currentSeats={organization.seatLimit}
        trial={t.onTrial ? { daysLeft: t.daysLeft ?? TRIAL_DAYS, employeeLimit: TRIAL_EMPLOYEE_LIMIT } : null}
        salesUrl={`${MARKETING_SITE_URL}/#demo`}
      />
    );
  }

  if (session?.user) {
    // Signed in, but not an admin (e.g. an employee session on this
    // browser) — plan changes are admin-only, and there's nothing useful
    // this page can do for them.
    return (
      <PlansShell narrow>
        <div className="mx-auto mt-16 flex max-w-[440px] flex-col items-center rounded-3xl border border-border bg-surface p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1d1f26] text-primary">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-[24px] font-bold tracking-[-0.025em] text-foreground">Admin access needed</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Changing a plan is an admin-only action. Ask your organization&apos;s admin to sign in here instead.
          </p>
        </div>
      </PlansShell>
    );
  }

  const callbackUrl = encodeURIComponent(currentUrl(params));
  const chosen = PAID_PLANS.find((p) => p.id === plan) ?? PAID_PLANS[1];
  const quote = computeQuote(plan, cycle, seats);
  const quoteOk = isQuoteError(quote) ? null : quote;
  const fmt = (paise: number) => `${CURRENCY_SYMBOL}${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const annual = cycle === "annual";
  const cardBase =
    "flex flex-col gap-3 rounded-3xl border-[1.5px] p-6 transition-all duration-200 hover:-translate-y-[3px] hover:shadow-[0_22px_38px_-28px_rgba(29,31,38,0.5)]";
  const btnBase =
    "mt-auto flex h-12 items-center justify-center gap-2 rounded-3xl text-sm font-bold transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <PlansShell back={{ href: "/", label: "Back to start" }}>
      <div className="mt-8 max-w-[640px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-dark">
          {chosen.name} · {seats} employees · {annual ? "yearly" : "monthly"}
        </span>
        <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[38px]">
          Let&apos;s get your team set up
        </h1>
        <p className="mt-2.5 text-[15px] text-muted">Have you used Inzivo before? Pick what fits you best.</p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-[18px] md:grid-cols-2">
        <div className={`${cardBase} border-border bg-surface`}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1d1f26] text-primary">
            <LogIn className="h-6 w-6" />
          </span>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">I already have a workspace</h2>
          <p className="text-[13.5px] leading-relaxed text-muted">
            Sign in to change the plan for your existing organization.
          </p>
          <ul className="flex flex-col gap-2 text-[13px] text-foreground">
            {["Keep your employees, shifts and history", "Pick up exactly where you left off"].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.6} />
                {t}
              </li>
            ))}
          </ul>
          <Link href={`/signin?callbackUrl=${callbackUrl}`} className={`${btnBase} bg-[#1d1f26] text-white`}>
            Sign in <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className={`${cardBase} border-primary bg-gradient-to-br from-surface to-primary/10`}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1d1f26] text-primary">
            <Building2 className="h-6 w-6" />
          </span>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-foreground">I&apos;m new here</h2>
          <p className="text-[13.5px] leading-relaxed text-muted">Try it free first, or set up and pay straight away.</p>
          <ul className="flex flex-col gap-2 text-[13px] text-foreground">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.6} />
              Free trial: {TRIAL_DAYS} days, up to {TRIAL_EMPLOYEE_LIMIT} employees, no card
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.6} />
              Or buy the plan you chose{quoteOk ? `: ${fmt(quoteOk.amountPaise)} ${annual ? "for a year" : "a month"}` : ""}
            </li>
          </ul>
          <Link
            href="/register"
            className={`${btnBase} bg-primary text-white shadow-[0_16px_26px_-16px_#f06400]`}
          >
            Start my free trial <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`${MARKETING_SITE_URL}/signup?plan=${plan}&cycle=${cycle}&seats=${seats}`}
            className={`${btnBase} mt-0 border-[1.5px] border-foreground text-foreground`}
          >
            Set up and pay now
          </a>
        </div>
      </div>

      {quoteOk && (
        <div className="mt-5 flex flex-wrap gap-2.5">
          {[
            [chosen.name, `${fmt(quoteOk.pricePerSeatPaise)} / employee / mo, ${annual ? "yearly" : "monthly"}`],
            [`${quoteOk.seats} employees`, `Minimum ${chosen.minSeats} for this plan`],
            [fmt(quoteOk.amountPaise), `${annual ? "Total today" : "Per month"}, GST included`],
          ].map(([a, b]) => (
            <div key={a} className="rounded-2xl border border-border bg-surface px-4 py-3 text-[13px]">
              <b className="block text-[15px] text-foreground">{a}</b>
              <span className="text-xs text-muted">{b}</span>
            </div>
          ))}
        </div>
      )}
    </PlansShell>
  );
}
