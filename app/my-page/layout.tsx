import { auth } from "@/lib/auth";
import Providers from "@/components/Providers";
import SignOutButton from "@/components/SignOutButton";
import ChangePinButton from "@/components/ChangePinButton";
import TabSecurity from "@/components/TabSecurity";
import { Logo } from "@/components/Logo";

export default async function MyPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <Providers>
      <TabSecurity />
      <div className="min-h-screen bg-background py-3 sm:py-6 md:py-9">
        {/*
          Same composition as the admin panel: nav/header lives inside one
          bordered, 8px-radius panel on the light background, above a
          fading rule, rather than a page-wide bar outside it.
        */}
        <div className="w-[95%] mx-auto rounded-lg border border-border bg-surface overflow-hidden">
          <header className="bg-surface-2">
            <div className="flex items-center gap-3 px-5 sm:px-7 h-14">
              <Logo variant="static" size={18} className="text-foreground" />
              <span className="text-xs font-medium tracking-[0.12em] uppercase text-muted">
                My attendance
              </span>
              <div className="ml-auto flex items-center gap-2 text-[13px] text-muted">
                <span className="hidden sm:inline mr-1.5">
                  {session?.user?.name}
                </span>
                <ChangePinButton />
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
