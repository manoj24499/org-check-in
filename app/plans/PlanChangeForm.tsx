"use client";

import { useState } from "react";
import { ArrowRight, Check, Lock, Minus, Plus, X } from "lucide-react";
import { PAID_PLANS, CURRENCY_SYMBOL, MAX_SELF_SERVE_SEATS, type BillingCycle } from "@/lib/billing/plans";
import { PLAN_CONTENT } from "@/lib/billing/planContent";
import { computeQuote, isQuoteError } from "@/lib/billing/quote";
import type { CheckoutHandoff } from "@/lib/billing/gateway";
import PlansShell from "./PlansShell";

function formatPaise(paise: number): string {
  return `${CURRENCY_SYMBOL}${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const SHOWN_FEATURES = 5;

export default function PlanChangeForm({
  initialPlan,
  initialCycle,
  initialSeats,
  organizationName,
  currentPlanId,
  currentSeats,
  trial,
  salesUrl,
}: {
  /** Marketing site's "talk to sales" link (resolved on the server; the env var isn't exposed to the browser). */
  salesUrl: string;
  initialPlan: string;
  initialCycle: "monthly" | "annual";
  initialSeats: number;
  organizationName: string;
  currentPlanId: string | null;
  currentSeats: number | null;
  /** Set only while the organization is on the free trial. */
  trial?: { daysLeft: number; employeeLimit: number } | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [seats, setSeats] = useState(initialSeats);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = computeQuote(plan, cycle, seats);
  const quoteError = isQuoteError(quote) ? quote : null;
  const quoteOk = isQuoteError(quote) ? null : quote;

  const selected = PAID_PLANS.find((p) => p.id === plan)!;
  const currentPlanName = currentPlanId ? (PAID_PLANS.find((p) => p.id === currentPlanId)?.name ?? currentPlanId) : null;
  const isUnchanged = plan === currentPlanId && seats === currentSeats;
  const annual = cycle === "annual";

  function choosePlan(id: string) {
    setPlan(id);
    const min = PAID_PLANS.find((p) => p.id === id)?.minSeats ?? 1;
    setSeats((s) => Math.max(s, min));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/plan-change/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, cycle, seats }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Something went wrong.");
      return;
    }

    const handoff: CheckoutHandoff = data.handoff;
    if (handoff.kind === "redirect") {
      window.location.href = handoff.url;
      return;
    }
    setLoading(false);
    setError("This payment method isn't available yet. Please try again shortly.");
  }

  return (
    <PlansShell back={{ href: "/admin/settings", label: "Back to settings" }}>
      <div className="mt-8 max-w-[640px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-dark">
          {organizationName} · Plans &amp; billing
        </span>
        <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[38px]">
          Pick the plan that fits your team
        </h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
          Every plan includes geofenced, photo-verified check-in. Change or upgrade whenever you need to.
        </p>
        {currentPlanName ? (
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-700">
            <span className="h-[7px] w-[7px] rounded-full bg-current" />
            Current plan: {currentPlanName} · {currentSeats} employees
          </span>
        ) : (
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-[12.5px] font-semibold text-amber-700">
            <span className="h-[7px] w-[7px] rounded-full bg-current" />
            {trial && trial.daysLeft !== null
              ? `Free trial · ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left · up to ${trial.employeeLimit} employees`
              : "You're currently on the free trial"}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-border bg-surface p-1 shadow-sm">
            {(
              [
                ["monthly", "Monthly"],
                ["annual", "Yearly"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setCycle(id)}
                className={`flex items-center gap-2 rounded-full px-[18px] py-2 text-[13px] font-semibold transition-colors ${
                  cycle === id ? "bg-[#1d1f26] text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
                {id === "annual" && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] ${
                      cycle === id ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-700"
                    }`}
                  >
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted">Prices per employee, per month. GST (18%) is added at checkout.</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 pt-3 md:grid-cols-3">
          {PAID_PLANS.map((p) => {
            const content = PLAN_CONTENT[p.id];
            const isSel = plan === p.id;
            const isCurrent = p.id === currentPlanId;
            const price = annual ? p.annualPaise : p.monthlyPaise;
            const open = expanded === p.id;
            const features = open ? content.features : content.features.slice(0, SHOWN_FEATURES);
            const hidden = content.features.length - SHOWN_FEATURES;
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSel}
                onClick={() => choosePlan(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choosePlan(p.id);
                  }
                }}
                className={`relative flex cursor-pointer flex-col rounded-3xl border-[1.5px] bg-surface p-[22px] transition-all duration-200 hover:-translate-y-[3px] hover:shadow-[0_22px_38px_-28px_rgba(29,31,38,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isSel
                    ? "border-primary shadow-[0_0_0_4px_rgba(240,100,0,0.12),0_22px_38px_-28px_rgba(240,100,0,0.55)]"
                    : "border-border"
                }`}
              >
                {content.featured && (
                  <span className="absolute -top-3 left-[22px] rounded-full bg-primary px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white">
                    Most popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute right-[18px] top-[18px] rounded-full bg-emerald-500/10 px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-emerald-700">
                    Your plan
                  </span>
                )}
                <div className="text-lg font-bold text-foreground">{p.name}</div>
                <div className="mt-1 min-h-[34px] text-[12.5px] leading-snug text-muted">{content.tagline}</div>
                <div className="mt-3.5 flex items-baseline text-[38px] font-bold leading-none tracking-[-0.04em] text-foreground">
                  {formatPaise(price)}
                  <small className="ml-1 text-[13px] font-medium tracking-normal text-muted">/ employee / mo</small>
                </div>
                <div className="mt-1 min-h-[16px] text-xs text-muted line-through">
                  {annual ? `${formatPaise(p.monthlyPaise)} billed monthly` : ""}
                </div>
                <span className="mt-2.5 self-start rounded-full bg-border-soft px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                  From {p.minSeats} employees
                </span>
                <div
                  className={`mt-3.5 flex h-[42px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] text-[13.5px] font-semibold transition-colors ${
                    isSel ? "border-[#1d1f26] bg-[#1d1f26] text-white" : "border-border text-muted"
                  }`}
                >
                  {isSel ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={3} /> Selected
                    </>
                  ) : (
                    "Select plan"
                  )}
                </div>
                <div className="mt-4 flex flex-col gap-[9px] border-t border-border-soft pt-3.5">
                  <b className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {content.inheritsFrom ? `Everything in ${content.inheritsFrom}, plus` : "Includes"}
                  </b>
                  {features.map((f) => (
                    <div key={f} className="flex gap-[9px] text-[13px] leading-snug text-foreground">
                      <Check className="mt-0.5 h-[15px] w-[15px] shrink-0 text-emerald-600" strokeWidth={2.6} />
                      {f}
                    </div>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(open ? null : p.id);
                      }}
                      className="self-start text-[12.5px] font-semibold text-primary-dark hover:underline"
                    >
                      {open ? "Show less" : `+ ${hidden} more`}
                    </button>
                  )}
                  {content.absent?.map((f) => (
                    <div key={f} className="flex gap-[9px] text-[13px] leading-snug text-muted">
                      <X className="mt-0.5 h-[15px] w-[15px] shrink-0" strokeWidth={2.4} />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-dashed border-border bg-surface px-[22px] py-4 text-[13.5px] text-muted">
          <span>
            <b className="text-foreground">More than {MAX_SELF_SERVE_SEATS} employees, or your own servers?</b> Enterprise
            has custom pricing and hosting.
          </span>
          <a href={salesUrl} className="text-[13px] font-bold text-primary-dark hover:underline">
            Talk to sales →
          </a>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="sticky bottom-3.5 z-10 mt-5 grid grid-cols-1 items-center gap-5 rounded-[26px] bg-[#1d1f26] p-5 text-white shadow-[0_30px_50px_-30px_rgba(29,31,38,0.7)] md:grid-cols-[1.1fr_1fr_1.2fr] md:gap-7 md:px-[26px] md:py-[22px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Your order</div>
            <h3 className="mt-1.5 text-xl font-semibold">
              {selected.name} · {annual ? "billed yearly" : "billed monthly"}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-white/60">Employees (minimum {selected.minSeats})</p>
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 p-[5px]">
              <button
                type="button"
                onClick={() => setSeats((s) => Math.max(selected.minSeats, s - 5))}
                aria-label="Decrease employee count"
                className="grid h-8 w-8 place-items-center rounded-full bg-white/15 transition-colors hover:bg-primary"
              >
                <Minus className="h-4 w-4" strokeWidth={2.6} />
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Employees"
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Math.min(MAX_SELF_SERVE_SEATS * 2, Number(e.target.value) || 1)))}
                className="w-14 bg-transparent text-center text-[15px] font-bold tabular-nums text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSeats((s) => s + 5)}
                aria-label="Increase employee count"
                className="grid h-8 w-8 place-items-center rounded-full bg-white/15 transition-colors hover:bg-primary"
              >
                <Plus className="h-4 w-4" strokeWidth={2.6} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-[13px] text-white/75">
            {quoteError ? (
              <p className="text-red-300">{quoteError.error}</p>
            ) : (
              quoteOk && (
                <>
                  <div className="flex justify-between gap-3">
                    <span>
                      {formatPaise(quoteOk.pricePerSeatPaise)} × {quoteOk.seats} employees{annual ? " × 12 mo" : ""}
                    </span>
                    <span>{formatPaise(quoteOk.subtotalPaise)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>GST (18%)</span>
                    <span>{formatPaise(quoteOk.taxPaise)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-3 border-t border-white/15 pt-2 text-[15px] font-bold text-white">
                    <span>{annual ? "Total today" : "Total per month"}</span>
                    <span>{formatPaise(quoteOk.amountPaise)}</span>
                  </div>
                </>
              )
            )}
          </div>

          <div>
            <button
              disabled={loading || !quoteOk || isUnchanged}
              className="flex h-14 w-full items-center justify-between rounded-[28px] bg-primary pl-6 pr-2 text-[15px] font-bold text-white shadow-[0_18px_30px_-16px_#f06400] transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Starting checkout…" : isUnchanged ? "This is your current plan" : "Continue to payment"}
              <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-white/20">
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-white/55">
              <Lock className="h-3 w-3" /> Secure checkout · Full price for a fresh term, no proration
            </p>
          </div>
        </div>
      </form>
    </PlansShell>
  );
}
