"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, XCircle, Loader2, MailCheck, Clock3, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { suggestOrgSlug } from "@/lib/orgSlug";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const TEAM_SIZES = ["1-5", "6-20", "21-50", "51-200", "200+"];
const INPUT =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

type Done = { email: string; emailSent: boolean; trialDays: number; employeeLimit: number };

export default function RegisterPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  // Once the admin edits the slug directly, stop overwriting it from the
  // organization name field — otherwise every keystroke in the name would
  // clobber a deliberate manual edit.
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const slugCheckToken = useRef(0);

  function handleOrganizationNameChange(value: string) {
    setOrganizationName(value);
    if (!slugTouched) setSlug(suggestOrgSlug(value));
  }

  // All setState calls deferred into the setTimeout callback (even the
  // "empty slug" reset, via a 0ms timeout) rather than called synchronously
  // in the effect body — same convention as app/kiosk/KioskClient.tsx's own
  // debounced status lookup.
  useEffect(() => {
    const token = ++slugCheckToken.current;
    const timer = setTimeout(
      async () => {
        if (!slug) {
          setSlugStatus("idle");
          return;
        }
        setSlugStatus("checking");
        try {
          const res = await fetch(`/api/register/check-slug?slug=${encodeURIComponent(slug)}`);
          const data = await res.json();
          if (slugCheckToken.current !== token) return; // a newer check superseded this one
          if (!data.available) {
            setSlugStatus(data.reason === "invalid" ? "invalid" : "taken");
          } else {
            setSlugStatus("available");
          }
        } catch {
          if (slugCheckToken.current === token) setSlugStatus("idle");
        }
      },
      slug ? 400 : 0,
    );
    return () => clearTimeout(timer);
  }, [slug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const adminEmail = String(form.get("adminEmail")).trim();

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: form.get("organizationName"),
        slug,
        adminName: form.get("adminName"),
        adminEmail,
        phone: form.get("phone"),
        teamSize: form.get("teamSize"),
        industry: String(form.get("industry") ?? "").trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(
        data.error === "Invalid input."
          ? "Please check the details. The phone number should have digits only (a + or spaces are fine)."
          : (data.error ?? "Something went wrong."),
      );
      return;
    }

    // No sign-in here: the new admin sets a password from the link we email, which also confirms the address.
    setDone({
      email: adminEmail,
      emailSent: data.emailSent !== false,
      trialDays: data.trialDays ?? 7,
      employeeLimit: data.employeeLimit ?? 5,
    });
  }

  const slugHint =
    slugStatus === "checking" ? (
      <span className="inline-flex items-center gap-1 text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking availability…
      </span>
    ) : slugStatus === "available" ? (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> Available
      </span>
    ) : slugStatus === "taken" ? (
      <span className="inline-flex items-center gap-1 text-red-700">
        <XCircle className="w-3.5 h-3.5" /> Already taken
      </span>
    ) : slugStatus === "invalid" ? (
      <span className="inline-flex items-center gap-1 text-red-700">
        <XCircle className="w-3.5 h-3.5" /> Lowercase letters, numbers, and hyphens only
      </span>
    ) : null;

  const ready = organizationName.trim().length > 0 && slugStatus === "available";

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[460px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
          <Logo variant="static" size={20} className="text-foreground mb-5" />
          <div className="mt-2 flex flex-col gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <MailCheck className="h-6 w-6" />
            </span>
            <h1 className="text-[26px] font-medium tracking-[-0.025em] text-foreground">Check your email</h1>
            {done.emailSent ? (
              <p className="text-sm text-muted-2">
                We sent an activation link to <span className="font-medium text-foreground">{done.email}</span>. Open it to
                choose your password and start your free trial. The link works for 72 hours.
              </p>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Your organization was created, but we couldn&apos;t send the email to {done.email} just now. Request a new
                link from the{" "}
                <Link href="/activate" className="font-medium underline">
                  activation page
                </Link>
                .
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-2">
              <li className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {done.trialDays}-day free trial, starting when you activate. We email you 2 days before it ends.
              </li>
              <li className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Add up to {done.employeeLimit} employees and try check-ins, shifts and the live dashboard.
              </li>
            </ul>
            <Link href="/login" className="mt-4 text-sm font-medium text-primary-dark hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[460px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back
        </Link>

        <div className="mt-7 flex flex-col gap-1">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">Free trial</span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground flex items-center gap-2.5">
            <Building2 className="w-[22px] h-[22px] text-primary" />
            Register your organization
          </h1>
          <p className="mt-1 text-sm text-muted-2">
            7 days free, up to 5 employees. We&apos;ll email you an activation link to start.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Organization name</label>
            <input
              name="organizationName"
              type="text"
              required
              value={organizationName}
              onChange={(e) => handleOrganizationNameChange(e.target.value)}
              className={INPUT}
              placeholder="Acme Corp"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Organization code</label>
            <input
              name="slug"
              type="text"
              required
              autoCapitalize="none"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
              className={INPUT}
              placeholder="acme-corp"
            />
            <p className="text-xs mt-0.5 min-h-[1em]">
              {slugHint ?? (
                <span className="text-muted">
                  Employees will use this to sign in and check in — you can share it with them later.
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Team size</label>
              <select name="teamSize" required defaultValue="" className={INPUT}>
                <option value="" disabled>
                  Select
                </option>
                {TEAM_SIZES.map((t) => (
                  <option key={t} value={t}>
                    {t} people
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">Industry (optional)</label>
              <input name="industry" type="text" maxLength={80} className={INPUT} placeholder="e.g. Retail, Services" />
            </div>
          </div>

          <div className="border-t border-border-soft my-1" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Your name</label>
            <input name="adminName" type="text" required className={INPUT} placeholder="Jane Doe" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Work email</label>
            <input name="adminEmail" type="email" required autoComplete="email" className={INPUT} placeholder="jane@acme.com" />
            <p className="text-xs text-muted">We&apos;ll send your activation link here.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Phone number</label>
            <input name="phone" type="tel" required autoComplete="tel" className={INPUT} placeholder="+91 98765 43210" />
          </div>

          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            disabled={loading || !ready}
            className="mt-1 flex w-full items-center justify-between rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creating your organization…" : "Start my free trial"}
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </main>
  );
}
