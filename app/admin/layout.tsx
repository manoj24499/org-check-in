import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Providers from "@/components/Providers";
import TabSecurity from "@/components/TabSecurity";
import AdminHeader from "@/components/AdminHeader";

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
      {/* Fixed-height app shell, not a page that scrolls natively — `main`
          below is the only thing that scrolls, so the header (and its nav)
          stays put no matter how long a given admin page's content gets. */}
      <div className="h-screen overflow-hidden bg-background py-3 sm:py-6 md:py-9">
        {/*
          The whole page — nav and content — lives inside one bordered,
          8px-radius panel on the light background, per the Nocturne mock:
          the header sits *inside* the card, above a fading rule, not as a
          page-wide bar outside it. Panel is 95% of the viewport width
          rather than a fixed max-width, so it scales with the screen.
        */}
        <div className="w-[95%] mx-auto h-full rounded-lg border border-border bg-surface overflow-hidden flex flex-col">
          <AdminHeader userName={session?.user?.name} pendingLeaveCount={pendingLeaveCount} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </Providers>
  );
}
