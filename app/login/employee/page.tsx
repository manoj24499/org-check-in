"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AuthSplit, { EMPLOYEE_PANEL } from "@/components/AuthSplit";
import { ErrorNote, PasswordField, SubmitButton, TextField } from "@/components/AuthFields";

export default function EmployeeLoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleEmployeeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await signIn("employee-login", {
      organizationCode: form.get("organizationCode"),
      employeeCode: form.get("employeeCode"),
      pin: form.get("pin"),
      redirect: false,
    });

    setLoading(false);
    if (res?.error) {
      setError("Invalid organization code, employee ID, or PIN.");
    } else {
      sessionStorage.setItem("tab_auth", "true");
      router.push("/my-page");
      router.refresh();
    }
  }

  return (
    <AuthSplit panel={EMPLOYEE_PANEL}>
      <Link
        href="/login"
        className="mb-6 inline-flex items-center gap-1.5 self-start text-[13px] text-muted-2 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-[15px] w-[15px]" />
        Back
      </Link>

      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">Employee portal</span>
      <h1 className="mt-2 text-[30px] font-medium leading-tight tracking-[-0.03em] text-foreground">Sign in</h1>
      <p className="mt-2 text-sm text-muted-2">Use your organization code, employee ID and PIN.</p>

      <form onSubmit={handleEmployeeSubmit} className="mt-8 flex flex-col gap-4">
        <TextField
          id="emp-org"
          name="organizationCode"
          label="Organization code"
          type="text"
          required
          autoFocus
          autoCapitalize="none"
          placeholder="acme-corp"
        />
        <TextField id="emp-id" name="employeeCode" label="Employee ID" type="text" required placeholder="EMP001" />
        <PasswordField
          id="emp-pin"
          name="pin"
          label="PIN"
          inputMode="numeric"
          required
          autoComplete="current-password"
          placeholder="••••"
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        <SubmitButton loading={loading} idle="Access portal" busy="Signing in…" />
      </form>
    </AuthSplit>
  );
}
