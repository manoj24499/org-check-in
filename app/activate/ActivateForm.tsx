"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import ResendForm from "./ResendForm";

/**
 * Advisory only — the server enforces just the 8-character minimum. The
 * meter and tips are there to nudge toward something stronger.
 */
function assess(password: string) {
  const checks = [
    { label: "At least 8 characters", ok: password.length >= 8 },
    { label: "Upper and lower case", ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "A number", ok: /\d/.test(password) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  let score = checks.filter((c) => c.ok).length;
  if (password.length >= 12 && score >= 3) score = 4;
  if (password.length < 8) score = Math.min(score, 1);
  const level = password.length === 0 ? 0 : Math.max(1, Math.min(4, score));
  return { checks, level };
}

const LEVELS = [
  { label: "", bar: "bg-border" },
  { label: "Weak", bar: "bg-red-500" },
  { label: "Fair", bar: "bg-amber-500" },
  { label: "Good", bar: "bg-lime-500" },
  { label: "Strong", bar: "bg-green-600" },
];

export default function ActivateForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A token that was valid when the page rendered can still lose the race
  // to another submission (or simply expire) by the time this posts — that
  // shows the same resend affordance as an already-invalid link, rather
  // than a dead-end error.
  const [expired, setExpired] = useState(false);
  const router = useRouter();

  const { checks, level } = assess(password);
  const unlocked = password.length >= 8;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({ error: "Unexpected server response." }));

    if (!res.ok) {
      setLoading(false);
      if (data.error === "invalid_or_expired") {
        setExpired(true);
      } else {
        setError(data.error ?? "Something went wrong.");
      }
      return;
    }

    // Same sign-straight-in pattern as app/register/page.tsx — including the
    // tab_auth flag, which components/TabSecurity.tsx requires on every tab
    // that reaches an authenticated page or it force-signs-out immediately.
    const signInResult = await signIn("admin-login", { email, password, redirect: false });
    setLoading(false);
    if (signInResult?.error) {
      router.push("/login/admin");
      return;
    }
    sessionStorage.setItem("tab_auth", "true");
    router.push("/admin/dashboard");
    router.refresh();
  }

  if (expired) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">
          This link is no longer valid. Request a new one below.
        </p>
        <ResendForm />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="activate-email" className="text-xs text-muted-2">
          Email
        </label>
        <input
          id="activate-email"
          type="email"
          value={email}
          readOnly
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-muted-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="activate-password" className="text-xs text-muted-2">
          Password
        </label>
        <div className="relative">
          <input
            id="activate-password"
            type={show ? "text" : "password"}
            required
            minLength={8}
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 pr-11 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="At least 8 characters"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Strength meter */}
        <div className="mt-1 flex items-center gap-2">
          <div className="grid flex-1 grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-colors duration-300 ${i <= level ? LEVELS[level].bar : "bg-border"}`}
              />
            ))}
          </div>
          <span className="w-12 text-right text-xs font-medium text-muted-2">{LEVELS[level].label}</span>
        </div>

        <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
          {checks.map((c) => (
            <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-green-700" : "text-muted-2"}`}>
              <span
                className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full ${c.ok ? "bg-green-600 text-white" : "border border-border"}`}
              >
                {c.ok && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
              </span>
              {c.label}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>
      )}

      <button
        disabled={loading || !unlocked}
        className="mt-1 w-full rounded-lg bg-foreground text-white py-3 px-4 text-sm font-medium flex items-center justify-between hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Unlocking your workspace…" : "Activate account"}
        <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
