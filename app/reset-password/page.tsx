import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
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
    <AuthShell>
      <div className="mt-7 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">Account recovery</span>
        <h1 className="text-[28px] font-medium leading-tight tracking-[-0.03em] text-foreground">
          Choose a <span className="text-primary">new password</span>
        </h1>
      </div>
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
    </AuthShell>
  );
}
