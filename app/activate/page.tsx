import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import AuthSplit, { ATTENDANCE_PANEL, type AuthPanel } from "@/components/AuthSplit";
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

  const user = peek.ok
    ? await prisma.user.findUnique({
        where: { id: peek.userId },
        select: { email: true, name: true, organization: { select: { name: true } } },
      })
    : null;
  const email = user?.email ?? null;
  const orgName = user?.organization?.name ?? null;

  const reasonMessage =
    !peek.ok || !email
      ? peek.ok === false && peek.reason === "used"
        ? "This activation link has already been used."
        : peek.ok === false && peek.reason === "expired"
          ? "This activation link has expired."
          : "This activation link is invalid."
      : null;

  const panel: AuthPanel =
    email && orgName
      ? {
          eyebrow: "Your workspace",
          title: (
            <>
              {orgName} is <span className="text-primary">ready.</span>
            </>
          ),
          text: "Your payment is confirmed. Set a password and your team can start checking in today.",
          bullets: ATTENDANCE_PANEL.bullets,
        }
      : ATTENDANCE_PANEL;

  return (
    <AuthSplit panel={panel} footer="Your password is stored hashed and never shown to anyone.">
    {email ? (
      <>
        <span className="text-[11px] font-medium tracking-[0.16em] uppercase text-primary-dark">
          Account activation
        </span>
        <h1 className="mt-2 text-[30px] font-medium leading-tight tracking-[-0.03em] text-foreground">
          {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-2">
          Create a password to finish setting up{" "}
          {orgName ? <span className="font-medium text-foreground">{orgName}</span> : "your workspace"} and open
          your admin dashboard.
        </p>
        <ActivateForm token={token!} email={email} />
      </>
    ) : (
      <div className="flex flex-col gap-5">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <h1 className="text-[30px] font-medium leading-tight tracking-[-0.03em] text-foreground">
          This link can&apos;t be used
        </h1>
        <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{reasonMessage}</p>
        <ResendForm />
        <Link href="/signin" className="text-[13px] text-muted-2 transition-colors hover:text-foreground">
          Already activated? Sign in
        </Link>
      </div>
    )}
    </AuthSplit>
  );
}
