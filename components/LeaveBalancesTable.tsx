"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Clock, Search, TrendingDown, Trophy } from "lucide-react";
import { CARD, EmptyState, StatCard } from "@/components/admin/ui";

export type BalanceRow = {
  id: string;
  name: string;
  code: string;
  /** Days in requests still waiting for a decision. */
  pending: number;
  /** Requests still waiting for a decision. */
  pendingRequests: number;
  balances: { type: "CASUAL" | "SICK" | "EARNED"; quota: number; used: number; remaining: number }[];
};

const LABEL = { CASUAL: "Casual", SICK: "Sick", EARNED: "Earned" } as const;
const COLOR = { CASUAL: "#fb923c", SICK: "#818cf8", EARNED: "#34d399" } as const;
const LOW_BELOW = 2; // fewer than this many days left in a type counts as "running low"

type Filter = "all" | "low" | "pending";
type Sort = "name" | "low" | "used";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const AVATARS = [
  "from-orange-500 to-orange-700",
  "from-indigo-400 to-indigo-600",
  "from-emerald-400 to-emerald-600",
  "from-pink-400 to-pink-600",
];

function isLow(r: BalanceRow) {
  return r.balances.some((b) => b.quota > 0 && b.remaining < LOW_BELOW);
}

function Ring({ type, quota, used, remaining }: BalanceRow["balances"][number]) {
  const done = quota > 0 && remaining === 0;
  const low = quota > 0 && !done && remaining < LOW_BELOW;
  const color = done ? "#f87171" : low ? "#fbbf24" : COLOR[type];
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 px-2 pb-3 pt-3.5">
      <div
        className="relative grid h-[78px] w-[78px] place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${pct}%, rgba(148,163,184,0.25) 0)` }}
      >
        <div className="absolute inset-2 rounded-full bg-white" />
        <div className="relative text-center">
          <b className="block text-xl font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: done ? color : undefined }}>
            {remaining}
          </b>
          <span className="text-[10px] text-slate-500">of {quota}</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-slate-700">{LABEL[type]}</span>
      <span className="-mt-1.5 text-[11px] text-slate-500">{used} used</span>
    </div>
  );
}

export default function LeaveBalancesTable({ rows }: { rows: BalanceRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");

  const stats = useMemo(() => {
    const totalUsed = rows.reduce((s, r) => s + r.balances.reduce((a, b) => a + b.used, 0), 0);
    const perType = { CASUAL: 0, SICK: 0, EARNED: 0 } as Record<"CASUAL" | "SICK" | "EARNED", number>;
    for (const r of rows) for (const b of r.balances) perType[b.type] += b.used;
    const top = (Object.keys(perType) as (keyof typeof perType)[]).sort((a, b) => perType[b] - perType[a])[0];
    return {
      totalUsed,
      pendingDays: rows.reduce((s, r) => s + r.pending, 0),
      pendingRequests: rows.reduce((s, r) => s + r.pendingRequests, 0),
      low: rows.filter(isLow).length,
      withPending: rows.filter((r) => r.pending > 0).length,
      top,
      topDays: perType[top],
      topShare: totalUsed > 0 ? Math.round((perType[top] / totalUsed) * 100) : 0,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = rows.filter((r) => !s || r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s));
    if (filter === "low") list = list.filter(isLow);
    if (filter === "pending") list = list.filter((r) => r.pending > 0);
    const minLeft = (r: BalanceRow) => Math.min(...r.balances.filter((b) => b.quota > 0).map((b) => b.remaining), Infinity);
    const used = (r: BalanceRow) => r.balances.reduce((a, b) => a + b.used, 0);
    return [...list].sort((a, b) =>
      sort === "low" ? minLeft(a) - minLeft(b) : sort === "used" ? used(b) - used(a) : a.name.localeCompare(b.name),
    );
  }, [rows, q, filter, sort]);

  const chips: [Filter, string, number][] = [
    ["all", "All", rows.length],
    ["low", "Running low", stats.low],
    ["pending", "Has pending", stats.withPending],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Days taken this year" value={stats.totalUsed} hint={`across ${rows.length} employees`} icon={CalendarDays} tone="orange" />
        <StatCard
          label="Waiting for approval"
          value={`${stats.pendingDays} ${stats.pendingDays === 1 ? "day" : "days"}`}
          hint={`${stats.pendingRequests} ${stats.pendingRequests === 1 ? "request" : "requests"} pending`}
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="Running low"
          value={`${stats.low} ${stats.low === 1 ? "person" : "people"}`}
          hint={`under ${LOW_BELOW} days left in a leave type`}
          icon={TrendingDown}
          tone="red"
        />
        <StatCard
          label="Most used type"
          value={stats.totalUsed > 0 ? LABEL[stats.top] : "—"}
          hint={stats.totalUsed > 0 ? `${stats.topDays} days · ${stats.topShare}% of all leave` : "No leave taken yet"}
          icon={Trophy}
          tone="green"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] max-w-[340px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or employee ID"
            className={`${CARD} w-full py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30`}
          />
        </div>
        <div className={`${CARD} inline-flex p-[3px]`}>
          {chips.map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                filter === id ? "bg-orange-600 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
              <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${filter === id ? "bg-white/20" : "bg-slate-100"}`}>{n}</span>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12.5px] text-slate-500">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className={`${CARD} px-3 py-2 text-[13px] text-slate-700 focus:outline-none`}
          >
            <option value="name">Name</option>
            <option value="low">Lowest balance</option>
            <option value="used">Most leave taken</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className={CARD}>
          <EmptyState icon={CalendarCheck} title="No employees found" text="Try a different name, ID or filter." />
        </div>
      ) : (
        <div className="admin-stagger grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {shown.map((r, i) => {
            const done = r.balances.find((b) => b.quota > 0 && b.remaining === 0);
            const low = !done && isLow(r);
            return (
              <div key={r.id} className={`${CARD} lift p-5`}>
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] bg-gradient-to-br text-sm font-bold text-white ${AVATARS[i % AVATARS.length]}`}
                  >
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.code}</p>
                  </div>
                  <div className="ml-auto flex flex-wrap justify-end gap-1.5">
                    {r.pending > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-600">
                        {r.pending} {r.pending === 1 ? "day" : "days"} pending
                      </span>
                    )}
                    {done ? (
                      <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-500">
                        {LABEL[done.type]} finished
                      </span>
                    ) : low ? (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-600">Running low</span>
                    ) : r.pending === 0 ? (
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600">All good</span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  {r.balances.map((b) => (
                    <Ring key={b.type} {...b} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-slate-500">
        Showing {shown.length} of {rows.length} · the ring shows days left and fills as days are used
      </p>
    </div>
  );
}
