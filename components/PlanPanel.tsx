import Link from "next/link";
import { CreditCard, ArrowRight } from "lucide-react";
import { PAID_PLANS } from "@/lib/billing/plans";

/** Entry point into the self-serve plan-change flow (app/plans/) for an
 * admin who's already inside the app — the marketing site's pricing page is
 * one way to reach it, this is the other, so an admin isn't forced back out
 * to the marketing site just to upgrade their own workspace. */
export default function PlanPanel({ planId, seatLimit }: { planId: string | null; seatLimit: number | null }) {
  const planName = planId ? PAID_PLANS.find((p) => p.id === planId)?.name ?? planId : null;

  return (
    <div className="rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-4 flex flex-col h-full">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <CreditCard className="w-3.5 h-3.5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Plan &amp; billing</p>
          <p className="text-xs text-secondary mt-1">
            {planName ? `${planName} plan, ${seatLimit} seats` : "Free trial"}
          </p>
        </div>
      </div>

      <Link
        href="/plans"
        className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary px-2.5 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary/5 transition self-start"
      >
        Change plan
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
