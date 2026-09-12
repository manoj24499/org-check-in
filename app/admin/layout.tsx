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
  const pendingOvertimeCount =
    session?.user?.role === "ADMIN" ? await prisma.overtimeRequest.count({ where: { status: "PENDING" } }) : 0;
  const pendingSupportCount =
    session?.user?.role === "ADMIN" ? await prisma.supportTicket.count({ where: { status: "OPEN" } }) : 0;

  return (
    <Providers>
      <TabSecurity />
      {/* Fixed-height app shell, not a page that scrolls natively — `main`
          below is the only thing that scrolls, so the header (and its nav)
          stays put no matter how long a given admin page's content gets.
          Used to be a bordered, rounded "floating panel" inset from the
          browser edge on all sides (95% width + vertical padding), per the
          original Nocturne mock — dropped in favor of true full-bleed
          (both width AND height now, not just width) once the admin pages
          themselves outgrew that inset: employee pagination/search, the
          Support list, wider tables all wanted the room, and the leftover
          gutter had nothing left to justify it. No border/rounded corners
          on the inner panel anymore either — with zero inset on any edge,
          a rounded corner would just clip a triangle of `bg-background`
          into each corner of the screen instead of reading as a panel. */}
      <div className="h-screen overflow-hidden bg-surface flex flex-col">
        <AdminHeader
          userName={session?.user?.name}
          pendingLeaveCount={pendingLeaveCount}
          pendingOvertimeCount={pendingOvertimeCount}
          pendingSupportCount={pendingSupportCount}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </Providers>
  );
}
