import Link from "next/link";
import { CreditCard, ArrowRight } from "lucide-react";
import { PAID_PLANS } from "@/lib/billing/plans";
import { BTN_PRIMARY, CARD, IconChip } from "./admin/ui";

/** Entry point into the self-serve plan-change flow (app/plans/) for an
 * admin who's already inside the app — the marketing site's pricing page is
 * one way to reach it, this is the other, so an admin isn't forced back out
 * to the marketing site just to upgrade their own workspace. */
export default function PlanPanel({ planId, seatLimit }: { planId: string | null; seatLimit: number | null }) {
  const planName = planId ? PAID_PLANS.find((p) => p.id === planId)?.name ?? planId : null;

  return (
    <div className={`${CARD} flex h-full flex-col gap-4 p-5`}>
      <div className="flex items-start gap-3">
        <IconChip icon={CreditCard} />
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Plan &amp; billing</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {planName ? `${planName} plan, ${seatLimit} seats` : "Free trial"}
          </p>
        </div>
      </div>

      <Link
        href="/plans"
        className={`${BTN_PRIMARY} self-start`}
      >
        Change plan
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
