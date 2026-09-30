"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, Minus, Plus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PAID_PLANS, CURRENCY_SYMBOL, MAX_SELF_SERVE_SEATS, type BillingCycle } from "@/lib/billing/plans";
import { computeQuote, isQuoteError } from "@/lib/billing/quote";
import type { CheckoutHandoff } from "@/lib/billing/gateway";

function formatPaise(paise: number): string {
  return `${CURRENCY_SYMBOL}${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function PlanChangeForm({
  initialPlan,
  initialCycle,
  initialSeats,
  organizationName,
  currentPlanId,
  currentSeats,
}: {
  initialPlan: string;
  initialCycle: "monthly" | "annual";
  initialSeats: number;
  organizationName: string;
  currentPlanId: string | null;
  currentSeats: number | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [seats, setSeats] = useState(initialSeats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quote = computeQuote(plan, cycle, seats);
  const quoteError = isQuoteError(quote) ? quote : null;
  const quoteOk = isQuoteError(quote) ? null : quote;

  const currentPlanName = currentPlanId ? PAID_PLANS.find((p) => p.id === currentPlanId)?.name ?? currentPlanId : null;
  const isUnchanged = plan === currentPlanId && seats === currentSeats;

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
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[520px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/admin/settings"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back to settings
        </Link>

        <div className="mt-7 flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            {organizationName}
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground flex items-center gap-2.5">
            <Building2 className="w-[22px] h-[22px] text-primary" />
            Change your plan
          </h1>
          <p className="text-sm text-muted">
            {currentPlanName
              ? `Currently on ${currentPlanName}, ${currentSeats} seats.`
              : "You're currently on the free trial."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Plan</label>
            <div className="grid grid-cols-3 gap-2">
              {PAID_PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className={`rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors ${
                    plan === p.id
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-border text-muted hover:border-primary/40"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Billing</label>
              <div className="inline-flex items-center rounded-full border border-border bg-surface-2 p-0.5">
                <button
                  type="button"
                  onClick={() => setCycle("monthly")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    cycle === "monthly" ? "bg-primary text-white" : "text-muted"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setCycle("annual")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    cycle === "annual" ? "bg-primary text-white" : "text-muted"
                  }`}
                >
                  Annual
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Employees</label>
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-1 py-1">
                <button
                  type="button"
                  onClick={() => setSeats((s) => Math.max(1, s - 5))}
                  aria-label="Decrease employee count"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-primary-dark hover:bg-primary/10"
                >
                  <Minus className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  value={seats}
                  onChange={(e) => setSeats(Math.max(1, Math.min(MAX_SELF_SERVE_SEATS * 2, Number(e.target.value) || 1)))}
                  className="w-14 bg-transparent text-center text-sm font-semibold text-foreground tabular-nums focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSeats((s) => s + 5)}
                  aria-label="Increase employee count"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted hover:text-primary-dark hover:bg-primary/10"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border-soft bg-surface-2 p-3.5 text-sm">
            {quoteError ? (
              <p className="text-red-700">{quoteError.error}</p>
            ) : (
              quoteOk && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {formatPaise(quoteOk.pricePerSeatPaise)}/employee/mo × {quoteOk.seats}
                      {cycle === "annual" ? " × 12" : ""}
                    </span>
                    <span className="text-foreground font-medium">{formatPaise(quoteOk.subtotalPaise)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>GST</span>
                    <span>{formatPaise(quoteOk.taxPaise)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-soft mt-1 pt-1.5">
                    <span className="text-foreground font-semibold">
                      Total {cycle === "annual" ? "(billed now)" : "(billed monthly)"}
                    </span>
                    <span className="text-foreground font-semibold">{formatPaise(quoteOk.amountPaise)}</span>
                  </div>
                </div>
              )
            )}
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>
          )}

          <button
            disabled={loading || !quoteOk || isUnchanged}
            className="mt-2 w-full rounded-lg border border-primary bg-transparent text-primary-dark py-3 px-4 text-sm font-medium flex items-center justify-between hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Starting checkout…" : isUnchanged ? "This is your current plan" : "Continue to payment"}
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-center text-muted">
            No proration — this charges the full price for a fresh term, same as a new signup.
          </p>
        </form>
      </div>
    </main>
  );
}
