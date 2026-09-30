"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PAID_PLANS } from "@/lib/billing/plans";

type UiStatus = "pending" | "applied" | "failed" | "needs_attention";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

export default function PlanChangeCompleteClient({
  checkoutRef,
  initiallyCancelled,
}: {
  checkoutRef: string | null;
  initiallyCancelled: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<UiStatus | null>(initiallyCancelled ? "failed" : null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!checkoutRef) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/plan-change/status?ref=${encodeURIComponent(checkoutRef!)}`);
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.status) return;
        setStatus(data.status);
        setPlanId(data.planId ?? null);
        setSeats(data.seats ?? null);
      } catch {
        // A transient network hiccup just gets picked up on the next tick.
      }
    }

    poll();
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        setGaveUp(true);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [checkoutRef]);

  useEffect(() => {
    if (status === "applied" || status === "needs_attention") {
      pollCount.current = MAX_POLLS;
    }
  }, [status]);

  const planName = planId ? PAID_PLANS.find((p) => p.id === planId)?.name ?? planId : null;

  let title: string;
  let body: string;
  if (!checkoutRef) {
    title = "Missing reference";
    body = "This link is incomplete. Head back to your settings to try again.";
  } else if (status === "applied") {
    title = "Plan updated";
    body = planName && seats ? `You're now on ${planName}, ${seats} seats.` : "Your new plan is now active.";
  } else if (status === "needs_attention") {
    title = "We've received your payment";
    body = "Our team will contact you within one business day to finish updating your plan.";
  } else if (status === "failed") {
    title = "Payment didn't go through";
    body = "Nothing was charged. You can try again whenever you're ready.";
  } else if (gaveUp) {
    title = "Still processing";
    body = "This is taking longer than usual. Check back in a few minutes, or contact support with your reference.";
  } else {
    title = "Processing your payment…";
    body = "This page will update automatically once it's confirmed.";
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8 text-center">
        <Logo variant="static" size={20} className="text-foreground mb-5 self-center" />
        <h1 className="text-[22px] font-medium tracking-[-0.025em] text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted">{body}</p>
        {checkoutRef && <p className="mt-3 text-xs text-muted">Reference: {checkoutRef}</p>}

        {(status === "applied" || status === "needs_attention") && (
          <button
            onClick={() => router.push("/admin/settings")}
            className="mt-6 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 px-4 text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            Back to settings
          </button>
        )}

        {status === "failed" && (
          <button
            onClick={() => router.push("/plans")}
            className="mt-6 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 px-4 text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            Try again
          </button>
        )}

        {(status === null || status === "pending") && !gaveUp && (
          <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        )}
      </div>
    </main>
  );
}
