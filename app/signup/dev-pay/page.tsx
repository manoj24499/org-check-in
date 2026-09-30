import { notFound } from "next/navigation";
import { CURRENCY_SYMBOL } from "@/lib/billing/plans";
import { Logo } from "@/components/Logo";

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

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
          Dev-only payment simulator
        </span>
        <h1 className="mt-1 text-[22px] font-medium tracking-[-0.025em] text-foreground">Simulate a payment</h1>
        <p className="mt-2 text-sm text-muted">
          Stands in for a real gateway&apos;s hosted checkout page — no real gateway is wired up yet.
        </p>

        <div className="mt-5 rounded-lg border border-border-soft bg-surface-2 p-4">
          <p className="text-xs text-muted">Amount</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">{amountDisplay}</p>
          <p className="mt-1 text-xs text-muted">Ref: {ref}</p>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <form action="/api/signup/dev-pay" method="POST">
            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="checkoutId" value={checkoutId} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="currency" value={currency ?? "INR"} />
            <input type="hidden" name="successUrl" value={successUrl} />
            <input type="hidden" name="cancelUrl" value={cancelUrl} />
            <input type="hidden" name="outcome" value="succeeded" />
            <button className="w-full rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 px-4 text-sm font-medium hover:bg-primary/5 transition-colors">
              Simulate success
            </button>
          </form>
          <form action="/api/signup/dev-pay" method="POST">
            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="checkoutId" value={checkoutId} />
            <input type="hidden" name="amount" value={amount} />
            <input type="hidden" name="currency" value={currency ?? "INR"} />
            <input type="hidden" name="successUrl" value={successUrl} />
            <input type="hidden" name="cancelUrl" value={cancelUrl} />
            <input type="hidden" name="outcome" value="failed" />
            <button className="w-full rounded-lg border border-border text-muted py-2.5 px-4 text-sm font-medium hover:bg-surface transition-colors">
              Simulate failure
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
