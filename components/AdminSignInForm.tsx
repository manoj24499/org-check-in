"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ErrorNote, PasswordField, SubmitButton, TextField } from "@/components/AuthFields";

/**
 * The one admin email + password sign-in, shared by /signin (the customer
 * entry the marketing site links to) and /login/admin (reached from the
 * /login account-type picker). Same underlying "admin-login" credential
 * check either way; only the framing differs.
 */
export default function AdminSignInForm({
  callbackUrl,
  eyebrow,
  heading,
  subtext,
  passwordReset = false,
  backHref,
  showRegisterLink = false,
}: {
  callbackUrl: string;
  eyebrow: string;
  heading: string;
  subtext: string;
  passwordReset?: boolean;
  backHref?: string;
  showRegisterLink?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await signIn("admin-login", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      sessionStorage.setItem("tab_auth", "true");
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <>
      {backHref && (
        <Link
          href={backHref}
          className="mb-6 inline-flex items-center gap-1.5 self-start text-[13px] text-muted-2 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-[15px] w-[15px]" />
          Back
        </Link>
      )}

      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">{eyebrow}</span>
      <h1 className="mt-2 text-[30px] font-medium leading-tight tracking-[-0.03em] text-foreground">{heading}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-2">{subtext}</p>

      {passwordReset && (
        <p className="mt-5 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
          Password updated. Sign in with your new password.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <TextField
          id="signin-email"
          name="email"
          type="email"
          label="Email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@company.com"
        />
        <PasswordField
          id="signin-password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          below={
            <Link href="/forgot-password" className="self-end text-xs font-medium text-primary-dark hover:underline">
              Forgot password?
            </Link>
          }
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <SubmitButton loading={loading} idle="Sign in" busy="Signing in…" />

        {showRegisterLink && (
          <p className="text-center text-xs text-muted-2">
            Don&apos;t have a workspace yet?{" "}
            <Link href="/plans" className="font-medium text-primary-dark hover:underline">
              Get started
            </Link>
          </p>
        )}
      </form>
    </>
  );
}
