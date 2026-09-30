import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import ForgotForm from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/signin"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back to sign in
        </Link>
        <div className="mt-7 flex flex-col gap-1">
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground">Forgot password</h1>
          <p className="text-sm text-muted">Enter your admin email and we&apos;ll send you a reset link.</p>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
