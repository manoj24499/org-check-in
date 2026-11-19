import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Presentation } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar, CARD, EmptyState, Page, PageHeader, Pill, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const dayTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const timeOnly = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

function minutesBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

/**
 * Meetings employees declared outside their shift hours (before or after). They need no approval, so this page
 * is only a record: who, when, what for, and whether it is still to come. A meeting inside shift hours is never
 * logged (the app and API refuse it).
 */
export default async function MeetingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) notFound();
  const organizationId = session.user.organizationId;

  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const meetings = await prisma.meeting.findMany({
    where: { endAt: { gte: since }, user: { organizationId } },
    orderBy: { startAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, employeeCode: true } },
    },
  });

  const upcoming = meetings.filter((m) => m.endAt >= now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const past = meetings.filter((m) => m.endAt < now);
  const inProgress = upcoming.filter((m) => m.startAt <= now).length;

  const Row = ({ m, live }: { m: (typeof meetings)[number]; live: boolean }) => (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4">
      <Avatar name={m.user.name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/employees/${m.user.id}`} className="text-[14px] font-semibold text-slate-900 hover:text-orange-600">
            {m.user.name}
          </Link>
          <span className="text-xs text-slate-500">{m.user.employeeCode}</span>
          {live && m.startAt <= now ? <Pill tone="green">In progress</Pill> : null}
        </div>
        <p className="mt-1 text-[13px] text-slate-700">{m.title}</p>
        <p className="mt-1 text-xs tabular-nums text-slate-500">
          {dayTime.format(m.startAt)} to {timeOnly.format(m.endAt)} · {minutesBetween(m.startAt, m.endAt)} min · logged{" "}
          {dayTime.format(m.createdAt)}
        </p>
      </div>
    </li>
  );

  return (
    <Page>
      <PageHeader
        eyebrow="Requests"
        title="Meetings"
        subtitle="Meetings employees have added outside their shift hours. No approval needed: this is for your information. They aren't reminded to check out, or checked out automatically, while one runs."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Upcoming" value={upcoming.length} hint="Not finished yet" icon={CalendarClock} tone="indigo" />
        <StatCard label="In progress" value={inProgress} hint="Happening right now" icon={Presentation} tone="orange" />
        <StatCard label="Last 30 days" value={past.length} hint="Already finished" icon={CheckCircle2} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Upcoming and in progress</h2>
          {upcoming.length === 0 ? (
            <div className={CARD}>
              <EmptyState icon={Presentation} title="No meetings coming up" text="Meetings employees add from the app appear here." />
            </div>
          ) : (
            <ul className={`${CARD} divide-y divide-black/[0.06] overflow-hidden`}>
              {upcoming.map((m) => (
                <Row key={m.id} m={m} live />
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">Past 30 days</h2>
          {past.length === 0 ? (
            <div className={CARD}>
              <EmptyState icon={Presentation} title="Nothing yet" text="Finished meetings are kept here for 30 days." />
            </div>
          ) : (
            <ul className={`${CARD} divide-y divide-black/[0.06] overflow-hidden`}>
              {past.map((m) => (
                <Row key={m.id} m={m} live={false} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
