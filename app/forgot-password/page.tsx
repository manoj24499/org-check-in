import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import ForgotForm from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="mt-7 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">Account recovery</span>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.03em] text-foreground">
          Forgot your <span className="text-primary">password?</span>
        </h1>
        <p className="text-sm text-muted">
          No problem. Enter your admin email and we&apos;ll send you a link to choose a new one.
        </p>
      </div>
      <ForgotForm />
      <Link
        href="/signin"
        className="mt-6 inline-flex items-center gap-1.5 self-center text-[13px] text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-[15px] h-[15px]" />
        Back to sign in
      </Link>
    </AuthShell>
  );
}
