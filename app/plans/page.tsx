import Link from "next/link";
import { ArrowLeft, ArrowRight, LogIn, Building2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
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
      select: { name: true, planTier: true, seatLimit: true },
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
    return (
      <PlanChangeForm
        initialPlan={plan}
        initialCycle={cycle}
        initialSeats={seats}
        organizationName={organization.name}
        currentPlanId={organization.planTier}
        currentSeats={organization.seatLimit}
      />
    );
  }

  if (session?.user) {
    // Signed in, but not an admin (e.g. an employee session on this
    // browser) — plan changes are admin-only, and there's nothing useful
    // this page can do for them.
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8 text-center">
          <Logo variant="static" size={20} className="text-foreground mb-5 self-center" />
          <h1 className="text-[22px] font-medium tracking-[-0.025em] text-foreground">Admin access needed</h1>
          <p className="mt-2 text-sm text-muted">
            Changing a plan is an admin-only action. Ask your organization&apos;s admin to sign in here instead.
          </p>
        </div>
      </main>
    );
  }

  const callbackUrl = encodeURIComponent(currentUrl(params));

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back to start
        </Link>

        <div className="mt-7 flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            {PAID_PLANS.find((p) => p.id === plan)?.name ?? "Growth"} · {seats} seats
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground">
            One quick question
          </h1>
          <p className="text-sm text-muted">Have you used Inzivo here before?</p>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href={`/signin?callbackUrl=${callbackUrl}`}
            className="group flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3.5 shadow-[0_1px_2px_rgba(41,43,49,0.05)] hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogIn className="w-[22px] h-[22px] text-primary shrink-0" />
            <span className="flex flex-col">
              <span className="text-[15px] sm:text-base font-medium text-foreground">
                Yes, sign me in
              </span>
              <span className="text-[13px] text-muted">Change your existing workspace&apos;s plan</span>
            </span>
            <ArrowRight className="w-[17px] h-[17px] ml-auto text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={`${MARKETING_SITE_URL}/signup?plan=${plan}&cycle=${cycle}&seats=${seats}`}
            className="group flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3.5 shadow-[0_1px_2px_rgba(41,43,49,0.05)] hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Building2 className="w-[22px] h-[22px] text-primary shrink-0" />
            <span className="flex flex-col">
              <span className="text-[15px] sm:text-base font-medium text-foreground">
                No, I&apos;m new here
              </span>
              <span className="text-[13px] text-muted">Set up a new workspace and pay</span>
            </span>
            <ArrowRight className="w-[17px] h-[17px] ml-auto text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </main>
  );
}
