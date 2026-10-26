import { notFound } from "next/navigation";
import { Check, FlaskConical, Lock, ShieldCheck, X } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/billing/plans";
import PlansShell from "@/app/plans/PlansShell";

const STEPS = [
  { label: "Plan", state: "done" },
  { label: "Payment", state: "active" },
  { label: "Confirmation", state: "todo" },
] as const;

/**
 * Stand-in for a real gateway's hosted checkout page (see
 * lib/billing/adapters/fake.ts) — only ever linked to from that adapter,
 * which itself refuses to run in production, so this page is harmless dead
 * weight rather than a real risk if it were ever reached there. Only
 * reached now by a signed-in admin's plan change (see app/plans/) — a
 * brand-new org's signup lands on the marketing site's own copy of this
 * same page instead, since it now owns that whole journey end to end.
 */
export default async function DevPayPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string;
    checkoutId?: string;
    amount?: string;
    currency?: string;
    successUrl?: string;
    cancelUrl?: string;
  }>;
}) {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    notFound();
  }

  const { ref, checkoutId, amount, currency, successUrl, cancelUrl } = await searchParams;
  if (!ref || !checkoutId || !amount || !successUrl || !cancelUrl) notFound();

  const amountDisplay = `${CURRENCY_SYMBOL}${(Number(amount) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const hidden = (
    <>
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="checkoutId" value={checkoutId} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="currency" value={currency ?? "INR"} />
      <input type="hidden" name="successUrl" value={successUrl} />
      <input type="hidden" name="cancelUrl" value={cancelUrl} />
    </>
  );

  return (
    <PlansShell narrow>
      <div className="mx-auto mt-10 w-full" style={{ maxWidth: 460 }}>
        <ol className="mb-6 flex items-center justify-between px-1" aria-label="Checkout progress">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                    s.state === "done"
                      ? "bg-emerald-600 text-white"
                      : s.state === "active"
                        ? "bg-primary text-white shadow-[0_0_0_4px_rgba(240,100,0,0.18)]"
                        : "border border-border bg-surface text-muted"
                  }`}
                >
                  {s.state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`text-[11px] font-semibold ${s.state === "todo" ? "text-muted" : "text-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={`mx-2 mb-5 h-0.5 flex-1 rounded-full ${s.state === "done" ? "bg-emerald-600" : "bg-border"}`} />
              )}
            </li>
          ))}
        </ol>

        <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_70px_-30px_rgba(29,31,38,0.35)]">
          <div className="flex items-center justify-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-800">
            <FlaskConical className="h-3.5 w-3.5" /> Test mode · no real money
          </div>

          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
              Order confirmation
              <span className="ml-auto inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Secure checkout
              </span>
            </div>

            <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-[-0.03em] text-foreground">
              Complete your payment
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              This stands in for a real gateway&apos;s hosted checkout. Pick an outcome to test the plan change.
            </p>

            <div className="mt-6 rounded-2xl bg-[#1d1f26] p-5 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Amount due</p>
              <p className="mt-1 text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums">{amountDisplay}</p>
              <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-white/15 pt-3 text-xs text-white/60">
                <span className="shrink-0">Reference</span>
                <span className="min-w-0 break-all text-right font-mono text-white">{ref}</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <form action="/api/signup/dev-pay" method="POST">
                {hidden}
                <input type="hidden" name="outcome" value="succeeded" />
                <button className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[26px] bg-primary text-sm font-bold text-white shadow-[0_16px_26px_-16px_#f06400] transition-all hover:-translate-y-0.5">
                  <ShieldCheck className="h-4 w-4" /> Simulate success
                </button>
              </form>
              <form action="/api/signup/dev-pay" method="POST">
                {hidden}
                <input type="hidden" name="outcome" value="failed" />
                <button className="flex h-12 w-full items-center justify-center gap-2 rounded-[24px] border-[1.5px] border-border text-sm font-semibold text-muted transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700">
                  <X className="h-4 w-4" /> Simulate failure
                </button>
              </form>
            </div>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" /> Your plan changes as soon as payment is confirmed.
        </p>
      </div>
    </PlansShell>
  );
}
