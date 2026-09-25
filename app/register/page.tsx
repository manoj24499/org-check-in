"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { suggestOrgSlug } from "@/lib/orgSlug";

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

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
  const router = useRouter();
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
    const adminEmail = String(form.get("adminEmail"));
    const adminPassword = String(form.get("adminPassword"));

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: form.get("organizationName"),
        slug,
        adminName: form.get("adminName"),
        adminEmail,
        adminPassword,
      }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Something went wrong.");
      return;
    }

    // Signs the new admin straight in — same NextAuth provider/flow as
    // app/login/admin/page.tsx — rather than sending them back to a login
    // form to re-enter what they just typed.
    const signInResult = await signIn("admin-login", { email: adminEmail, password: adminPassword, redirect: false });
    setLoading(false);
    if (signInResult?.error) {
      // The account was created successfully — this would only happen from
      // an unrelated glitch (e.g. a dropped request), so send them to sign
      // in manually rather than claiming registration itself failed.
      router.push("/login/admin");
      return;
    }
    sessionStorage.setItem("tab_auth", "true");
    router.push("/admin/dashboard");
    router.refresh();
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
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            Get started
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground flex items-center gap-2.5">
            <Building2 className="w-[22px] h-[22px] text-primary" />
            Register your organization
          </h1>
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
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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

          <div className="border-t border-border-soft my-1" />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Your name</label>
            <input
              name="adminName"
              type="text"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="Jane Doe"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Your email</label>
            <input
              name="adminEmail"
              type="email"
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="jane@acme.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted">Password</label>
            <input
              name="adminPassword"
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
              {error}
            </p>
          )}

          <button
            disabled={loading || !ready}
            className="mt-2 w-full rounded-lg border border-primary bg-transparent text-primary-dark py-3 px-4 text-sm font-medium flex items-center justify-between hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating your workspace…" : "Create organization"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </main>
  );
}
