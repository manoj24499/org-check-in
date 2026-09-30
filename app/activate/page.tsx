import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { prisma } from "@/lib/prisma";
import { peekUserToken } from "@/lib/userToken";
import ActivateForm from "./ActivateForm";
import ResendForm from "./ResendForm";

// The URL itself carries a live activation token — keep it out of search
// indexes and out of any Referer header this page's own links might send.
export const metadata: Metadata = {
  title: "Activate your account",
  robots: "noindex, nofollow",
  referrer: "no-referrer",
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Read-only — see peekUserToken's own comment on why rendering this page
  // must never be what consumes the token.
  const peek = token
    ? await peekUserToken(token, "ACCOUNT_ACTIVATION")
    : ({ ok: false, reason: "invalid" } as const);

  const email = peek.ok
    ? (await prisma.user.findUnique({ where: { id: peek.userId }, select: { email: true } }))?.email ?? null
    : null;

  const reasonMessage =
    !peek.ok || !email
      ? peek.ok === false && peek.reason === "used"
        ? "This activation link has already been used."
        : peek.ok === false && peek.reason === "expired"
          ? "This activation link has expired."
          : "This activation link is invalid."
      : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
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
            Activate your account
          </span>
          <h1 className="text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground">
            Set your password
          </h1>
        </div>

        {email ? (
          <ActivateForm token={token!} email={email} />
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">{reasonMessage}</p>
            <ResendForm />
          </div>
        )}
      </div>
    </main>
  );
}
