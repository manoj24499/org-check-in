import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { prisma } from "@/lib/prisma";
import { peekUserToken } from "@/lib/userToken";
import ResetForm from "./ResetForm";

// The URL carries a live reset token — keep it out of indexes and Referer headers.
export const metadata: Metadata = {
  title: "Reset password",
  robots: "noindex, nofollow",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // Read-only: rendering must never consume the token (link prefetchers).
  const peek = token ? await peekUserToken(token, "PASSWORD_RESET") : ({ ok: false, reason: "invalid" } as const);
  const email = peek.ok
    ? (await prisma.user.findUnique({ where: { id: peek.userId }, select: { email: true } }))?.email ?? null
    : null;

  const message =
    peek.ok === false && peek.reason === "used"
      ? "This reset link has already been used."
      : peek.ok === false && peek.reason === "expired"
        ? "This reset link has expired."
        : "This reset link is invalid.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface flex flex-col p-7 sm:p-8">
        <Logo variant="static" size={20} className="text-foreground mb-5" />
        <h1 className="mt-2 text-[26px] sm:text-[28px] font-medium tracking-[-0.025em] text-foreground">
          Choose a new password
        </h1>
        {email ? (
          <ResetForm token={token!} email={email} />
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg border border-red-100">{message}</p>
            <Link href="/forgot-password" className="text-sm text-primary-dark hover:underline">
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
