import Link from "next/link";
import { User, ShieldCheck, ArrowLeft, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function LoginSelectionPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-foreground transition-colors self-start"
        >
          <ArrowLeft className="w-[15px] h-[15px]" />
          Back to start
        </Link>

        <div className="mt-9 flex flex-col gap-1.5">
          <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
            Step 1 of 2
          </span>
          <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.025em] text-foreground">
            Who&apos;s signing in?
          </h1>
          <p className="text-sm text-muted">Pick your account type to continue.</p>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/login/employee"
            className="group flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3.5 shadow-[0_1px_2px_rgba(41,43,49,0.05)] hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <User className="w-[22px] h-[22px] text-primary shrink-0" />
            <span className="flex flex-col">
              <span className="text-[15px] sm:text-base font-medium text-foreground">
                Employee
              </span>
              <span className="text-[13px] text-muted">
                Your own attendance and history
              </span>
            </span>
            <ArrowRight className="w-[17px] h-[17px] ml-auto text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login/admin"
            className="group flex items-center gap-3.5 rounded-lg border border-border bg-surface-2 px-4 py-3.5 shadow-[0_1px_2px_rgba(41,43,49,0.05)] hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ShieldCheck className="w-[22px] h-[22px] text-primary shrink-0" />
            <span className="flex flex-col">
              <span className="text-[15px] sm:text-base font-medium text-foreground">
                Admin
              </span>
              <span className="text-[13px] text-muted">
                Manage employees and the workspace
              </span>
            </span>
            <ArrowRight className="w-[17px] h-[17px] ml-auto text-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </main>
  );
}
