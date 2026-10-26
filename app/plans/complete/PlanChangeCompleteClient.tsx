"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, LifeBuoy, RotateCcw, X } from "lucide-react";
import { PAID_PLANS } from "@/lib/billing/plans";
import PlansShell from "../PlansShell";

type UiStatus = "pending" | "applied" | "failed" | "needs_attention";
type View = "pending" | "success" | "failed" | "attention" | "stalled" | "missing";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 120;

const CONFETTI = [
  ["6%", "30px", "620deg", "3.4s", "0s", "#f06400"],
  ["14%", "-24px", "-480deg", "3s", "0.2s", "#059669"],
  ["22%", "40px", "540deg", "3.6s", "0.05s", "#f7b27a"],
  ["30%", "-34px", "700deg", "3.1s", "0.35s", "#1d1f26"],
  ["38%", "22px", "-560deg", "3.5s", "0.15s", "#f06400"],
  ["46%", "-18px", "480deg", "3.2s", "0.4s", "#f7b27a"],
  ["54%", "36px", "640deg", "3.7s", "0.1s", "#059669"],
  ["62%", "-30px", "-520deg", "3s", "0.3s", "#f06400"],
  ["70%", "26px", "580deg", "3.4s", "0.22s", "#1d1f26"],
  ["78%", "-40px", "-640deg", "3.3s", "0.08s", "#f7b27a"],
  ["86%", "20px", "500deg", "3.6s", "0.28s", "#059669"],
  ["94%", "-26px", "-600deg", "3.1s", "0.18s", "#f06400"],
];

const PENDING_STEPS = ["Confirming your payment", "Updating your plan", "Applying the new limits"];

export default function PlanChangeCompleteClient({
  checkoutRef,
  initiallyCancelled,
}: {
  checkoutRef: string | null;
  initiallyCancelled: boolean;
}) {
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

  const planName = planId ? (PAID_PLANS.find((p) => p.id === planId)?.name ?? planId) : null;

  let view: View;
  let title: string;
  let body: string;
  if (!checkoutRef) {
    view = "missing";
    title = "Missing reference";
    body = "This link is incomplete. Head back to your settings to try again.";
  } else if (status === "applied") {
    view = "success";
    title = "Plan updated";
    body = planName && seats ? `You're now on ${planName}, ${seats} seats.` : "Your new plan is now active.";
  } else if (status === "needs_attention") {
    view = "attention";
    title = "We've received your payment";
    body = "Our team will contact you within one business day to finish updating your plan.";
  } else if (status === "failed") {
    view = "failed";
    title = "Payment didn't go through";
    body = "Nothing was charged. You can try again whenever you're ready.";
  } else if (gaveUp) {
    view = "stalled";
    title = "Still processing";
    body = "This is taking longer than usual. Check back in a few minutes, or contact support with your reference.";
  } else {
    view = "pending";
    title = "Processing your payment…";
    body = "This page will update automatically once it's confirmed.";
  }

  const glow: Record<View, string> = {
    pending: "rgba(240,100,0,0.14)",
    success: "rgba(5,150,105,0.16)",
    failed: "rgba(220,38,38,0.12)",
    attention: "rgba(217,119,6,0.16)",
    stalled: "rgba(217,119,6,0.14)",
    missing: "rgba(120,124,140,0.10)",
  };

  const primaryBtn =
    "mt-6 flex h-12 w-full max-w-[280px] mx-auto items-center justify-center gap-2 rounded-3xl bg-primary px-7 text-sm font-bold text-white shadow-[0_16px_26px_-16px_#f06400] transition-all hover:-translate-y-0.5";

  return (
    <PlansShell narrow>
      {view === "success" && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          {CONFETTI.map(([left, dx, rot, dur, delay, color], i) => (
            <span
              key={i}
              className="pc-confetti absolute top-0"
              style={
                {
                  left,
                  width: 6,
                  height: 10,
                  borderRadius: 2,
                  background: color,
                  "--dx": dx,
                  "--rot": rot,
                  "--dur": dur,
                  "--delay": delay,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="relative mx-auto mt-10 w-full" style={{ maxWidth: 480 }}>
        <div
          className="overflow-hidden rounded-3xl border border-border bg-surface p-7 text-center shadow-[0_30px_70px_-30px_rgba(29,31,38,0.35)] transition-[background] duration-700 sm:p-9"
          style={{ backgroundImage: `radial-gradient(380px 220px at 50% 0%, ${glow[view]}, transparent 70%)` }}
        >
          <div className="mx-auto mb-6 grid h-24 w-24 place-items-center">
            {view === "pending" && (
              <div className="relative grid h-24 w-24 place-items-center">
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-primary/40 border-t-primary" />
                <span className="absolute inset-3 animate-pulse rounded-full bg-primary/10" />
              </div>
            )}
            {view === "success" && (
              <div className="pc-pop grid h-24 w-24 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_14px_34px_-10px_rgba(5,150,105,0.7)]">
                <Check className="h-11 w-11" strokeWidth={3} />
              </div>
            )}
            {view === "failed" && (
              <div className="pc-pop grid h-24 w-24 place-items-center rounded-full bg-red-50 text-red-600 ring-8 ring-red-500/10">
                <X className="h-11 w-11" strokeWidth={3} />
              </div>
            )}
            {(view === "attention" || view === "stalled") && (
              <div className="pc-pop grid h-24 w-24 place-items-center rounded-full bg-amber-50 text-amber-600 ring-8 ring-amber-500/10">
                <Clock className="h-11 w-11" strokeWidth={2.5} />
              </div>
            )}
            {view === "missing" && (
              <div className="grid h-24 w-24 place-items-center rounded-full bg-border-soft text-muted">
                <LifeBuoy className="h-10 w-10" />
              </div>
            )}
          </div>

          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-foreground">{title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{body}</p>

          {view === "success" && planName && seats && (
            <div className="mx-auto mt-5 flex w-fit items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left text-[13px]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1d1f26] text-sm font-bold text-primary">
                {planName[0]}
              </span>
              <span>
                <b className="block text-[15px] text-foreground">{planName}</b>
                <span className="text-xs text-muted">{seats} employees</span>
              </span>
            </div>
          )}

          {view === "pending" && (
            <ul className="mx-auto mt-6 flex max-w-xs flex-col gap-3 text-left text-sm">
              {PENDING_STEPS.map((t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      i === 0 ? "bg-primary text-white" : "border border-border text-muted"
                    }`}
                  >
                    {i === 0 ? (
                      <span className="h-2 w-2 animate-ping rounded-full bg-white" />
                    ) : (
                      <span className="text-[11px] font-bold">{i + 1}</span>
                    )}
                  </span>
                  <span className={i === 0 ? "font-semibold text-foreground" : "text-muted"}>{t}</span>
                </li>
              ))}
            </ul>
          )}

          {(view === "success" || view === "attention") && (
            <Link href="/admin/settings" className={primaryBtn}>
              Back to settings <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          {view === "failed" && (
            <Link href="/plans" className={primaryBtn}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Link>
          )}
          {view === "missing" && (
            <Link href="/admin/settings" className={primaryBtn}>
              Back to settings <ArrowRight className="h-4 w-4" />
            </Link>
          )}

          {view === "pending" && (
            <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-border-soft">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            </div>
          )}

          {checkoutRef && (
            <p className="mt-6 break-all border-t border-border-soft pt-4 text-xs text-muted">
              Reference: <span className="font-mono">{checkoutRef}</span>
            </p>
          )}
        </div>
      </div>
      <style>{`
        @keyframes pc-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes pc-fall { 0% { transform: translate3d(0,-20px,0) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate3d(var(--dx),105vh,0) rotate(var(--rot)); opacity: 0; } }
        .pc-confetti { animation: pc-fall var(--dur) ease-in var(--delay) 1 both; }
        .pc-pop { animation: pc-pop .5s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
    </PlansShell>
  );
}
