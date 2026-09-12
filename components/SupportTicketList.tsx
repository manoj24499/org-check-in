"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ImageIcon } from "lucide-react";

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

  return (
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {(["OPEN", "RESOLVED", "ALL"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? "bg-primary/10 text-primary border border-primary/20" : "text-muted hover:bg-surface"
              }`}
            >
              {f === "OPEN" ? "Open" : f === "RESOLVED" ? "Resolved" : "All"}
            </button>
          ))}
        </div>
        {openCount > 0 && (
          <span className="text-xs font-medium text-muted bg-surface rounded-full px-2.5 py-0.5 tabular-nums">
            {openCount} open
          </span>
        )}
      </div>

      {error ? <p className="px-4 py-2 text-xs text-red-600">{error}</p> : null}

      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-secondary text-sm">
          {filter === "OPEN" ? "No open issues right now." : "Nothing here."}
        </p>
      ) : (
        <div className="flex flex-col">
          {filtered.map((t) => {
            const isOpen = expanded.has(t.id);
            return (
              <div key={t.id} className="border-b border-border-soft last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleExpanded(t.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.02] transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "OPEN" ? "bg-amber-500" : "bg-primary"}`}
                  />
                  <span className="text-sm font-medium text-foreground shrink-0 max-w-[160px] truncate">
                    {t.user.name}
                  </span>
                  <span className="text-xs text-muted shrink-0">{t.user.employeeCode}</span>
                  <span className="text-sm text-secondary truncate flex-1 min-w-0">{t.message}</span>
                  {t.hasPhoto && <ImageIcon className="w-3.5 h-3.5 text-muted shrink-0" />}
                  <span className="text-xs text-muted shrink-0 tabular-nums">{formatDateTime(t.createdAt)}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-3.5 pl-[26px]">
                    <p className="text-sm text-secondary whitespace-pre-wrap">{t.message}</p>

                    {t.hasPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/support/${t.id}/photo`}
                        alt="Attached photo"
                        className="mt-2 max-w-xs rounded-md border border-border-soft"
                      />
                    ) : null}

                    {t.status === "OPEN" ? (
                      <div className="flex flex-wrap gap-2 mt-3 items-center">
                        <input
                          value={noteDraft[t.id] ?? ""}
                          onChange={(e) => setNoteDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                          placeholder="Optional note (visible to other admins only)…"
                          className="flex-1 min-w-[200px] rounded-lg border border-border bg-surface px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "RESOLVED")}
                          disabled={actingOn === t.id}
                          className="rounded-lg border border-primary bg-transparent text-primary-dark hover:bg-primary/5 px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
                        >
                          Mark resolved
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md bg-surface border border-border-soft p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                          Resolved {t.resolvedAt ? formatDateTime(t.resolvedAt) : ""}
                        </p>
                        {t.adminNote ? <p className="text-sm text-foreground whitespace-pre-wrap">{t.adminNote}</p> : null}
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "OPEN")}
                          disabled={actingOn === t.id}
                          className="mt-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors disabled:opacity-50"
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
