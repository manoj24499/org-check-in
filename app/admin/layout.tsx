import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import SignOutButton from "@/components/SignOutButton";
import TabSecurity from "@/components/TabSecurity";
import AdminNav from "@/components/AdminNav";
import { Logo } from "@/components/Logo";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // Server-rendered once per navigation (no live polling) — same "refresh to
  // see new state" pattern the rest of the admin panel already uses.
  const pendingLeaveCount =
    session?.user?.role === "ADMIN" ? await prisma.timeOffRequest.count({ where: { status: "PENDING" } }) : 0;

  return (
    <Providers>
      <TabSecurity />
      <div className="min-h-screen bg-background py-3 sm:py-6 md:py-9">
        {/*
          The whole page — nav and content — lives inside one bordered,
          8px-radius panel on the light background, per the Nocturne mock:
          the header sits *inside* the card, above a fading rule, not as a
          page-wide bar outside it. Panel is 95% of the viewport width
          rather than a fixed max-width, so it scales with the screen.
        */}
        <div className="w-[95%] mx-auto rounded-lg border border-border bg-surface overflow-hidden">
          <header className="bg-surface-2">
            <div className="flex flex-col gap-3 px-5 py-3 sm:px-7 md:flex-row md:items-center md:gap-6 md:py-0 md:h-14">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <Logo variant="static" size={18} className="text-foreground" />
                  <span className="text-xs font-medium tracking-[0.12em] uppercase text-muted">
                    Admin
                  </span>
                </div>
                <div className="flex items-center gap-4 md:hidden">
                  <SignOutButton />
                </div>
              </div>

              <AdminNav pendingLeaveCount={pendingLeaveCount} />

              <div className="hidden md:flex items-center gap-3.5 ml-auto text-[13px] text-muted">
                <span>{session?.user?.name}</span>
                <SignOutButton />
              </div>
            </div>
            <div className="fade-rule" />
          </header>
          <main>{children}</main>
        </div>
      </div>
    </Providers>
  );
}
