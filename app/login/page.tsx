import Link from "next/link";
import { User, ShieldCheck, ArrowLeft, ArrowRight } from "lucide-react";
import AuthSplit from "@/components/AuthSplit";

const OPTIONS = [
  { href: "/login/employee", icon: User, title: "Employee", text: "Your own attendance and history" },
  { href: "/login/admin", icon: ShieldCheck, title: "Admin", text: "Manage employees and the workspace" },
];

export default function LoginSelectionPage() {
  return (
    <AuthSplit>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 self-start text-[13px] text-muted-2 transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-[15px] w-[15px]" />
        Back to start
      </Link>

      <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">Step 1 of 2</span>
      <h1 className="mt-2 text-[30px] font-medium leading-tight tracking-[-0.03em] text-foreground">
        Who&apos;s signing in?
      </h1>
      <p className="mt-2 text-sm text-muted-2">Pick your account type to continue.</p>

      <div className="mt-8 flex flex-col gap-3">
        {OPTIONS.map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-lg border border-border bg-surface-2 px-4 py-4 transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-medium text-foreground">{title}</span>
              <span className="text-[13px] text-muted-2">{text}</span>
            </span>
            <ArrowRight className="ml-auto h-[17px] w-[17px] shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-[13px] text-muted-2">
        New organization?{" "}
        <Link href="/register" className="font-medium text-primary-dark hover:underline">
          Register here
        </Link>
      </p>
    </AuthSplit>
  );
}
