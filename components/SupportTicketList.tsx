"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ImageIcon, LifeBuoy, MessageSquare } from "lucide-react";
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, CARD, Card, EmptyState, Pill, Segmented } from "./admin/ui";

export interface SupportTicketEntry {
  id: string;
  message: string;
  hasPhoto: boolean;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  adminNote: string | null;
  user: { employeeCode: string; name: string };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Filter = "OPEN" | "RESOLVED" | "ALL";

/** Employee-submitted issues — filterable Open/Resolved/All, newest first.
 * Each ticket collapses to one compact row (name, a one-line message
 * preview, status) so a long queue of them doesn't turn the whole admin
 * page into an endless scroll the moment a few carry a photo/long message —
 * only the row(s) an admin actually clicks expand to show the full message,
 * photo, and resolve/reopen controls. Resolving is otherwise record-keeping
 * only (see the schema comment on SupportTicket), same "admin decision, no
 * employee-facing side effect beyond a status change" shape as
 * OvertimeHistoryList's approve/decline — except this one also pushes the
 * employee a notification on resolve (see the PATCH route). */
export default function SupportTicketList({ tickets: initial }: { tickets: SupportTicketEntry[] }) {
  const [tickets, setTickets] = useState(initial);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "ALL") return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

  const openCount = tickets.filter((t) => t.status === "OPEN").length;

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setStatus = async (id: string, status: "OPEN" | "RESOLVED") => {
    setActingOn(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/support/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNote: noteDraft[id] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Something went wrong.");
      }
      const updated = await res.json();
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: updated.status, resolvedAt: updated.resolvedAt, adminNote: updated.adminNote } : t,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  };

  const resolvedCount = tickets.filter((t) => t.status === "RESOLVED").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { key: "OPEN" as Filter, label: "Open", count: openCount },
            { key: "RESOLVED" as Filter, label: "Resolved", count: resolvedCount },
            { key: "ALL" as Filter, label: "All", count: tickets.length },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={filter === "OPEN" ? LifeBuoy : MessageSquare}
            title={filter === "OPEN" ? "No open issues" : "Nothing here"}
            text={
              filter === "OPEN"
                ? "When an employee reports a problem from the app, it will appear here."
                : "There are no tickets in this view yet."
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((t) => {
            const isOpen = expanded.has(t.id);
            return (
              <div key={t.id} className={`${CARD} overflow-hidden`}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(t.id)}
                  className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
                >
                  <Avatar name={t.user.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="truncate text-sm font-semibold text-slate-900">{t.user.name}</span>
                      <span className="text-xs text-slate-500">{t.user.employeeCode}</span>
                      <Pill tone={t.status === "OPEN" ? "amber" : "green"} dot>
                        {t.status === "OPEN" ? "Open" : "Resolved"}
                      </Pill>
                      {t.hasPhoto && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <ImageIcon className="h-3.5 w-3.5" /> Photo
                        </span>
                      )}
                    </div>
                    {!isOpen && <p className="mt-1 truncate text-sm text-slate-600">{t.message}</p>}
                  </div>
                  <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:block">
                    {formatDateTime(t.createdAt)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 pb-5 pt-4 sm:pl-[78px]">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{t.message}</p>

                    {t.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/support/${t.id}/photo`}
                        alt="Attached photo"
                        className="mt-3 max-w-xs rounded-xl border border-slate-200 shadow-sm"
                      />
                    ) : null}

                    {t.status === "OPEN" ? (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <input
                          value={noteDraft[t.id] ?? ""}
                          onChange={(e) => setNoteDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          placeholder="Optional note (visible to other admins only)…"
                          className="min-w-[200px] flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                        />
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "RESOLVED")}
                          disabled={actingOn === t.id}
                          className={`${BTN_PRIMARY} shrink-0 !px-4 !py-2 !text-xs`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark resolved
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                          Resolved {t.resolvedAt ? formatDateTime(t.resolvedAt) : ""}
                        </p>
                        {t.adminNote ? <p className="whitespace-pre-wrap text-sm text-slate-700">{t.adminNote}</p> : null}
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "OPEN")}
                          disabled={actingOn === t.id}
                          className={`${BTN_SECONDARY} mt-2 !px-3 !py-1.5 !text-xs`}
                        >
                          Reopen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
