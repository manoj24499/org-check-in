"use client";

import { useState } from "react";
import { MapPinned, Search } from "lucide-react";
import VisitedPlacesPanel from "./VisitedPlacesPanel";
import { Avatar, CARD, EmptyState } from "./admin/ui";

interface FieldEmployee {
  id: string;
  name: string;
  employeeCode: string;
}

/**
 * Field workers master-detail: a roster on the left (a scrolling chip row on
 * phones) and the selected worker's day on the right. The page scrolls as a
 * whole — the detail has its own map, journey and reimbursement sections.
 */
export default function FieldWorkersPanel({ employees }: { employees: FieldEmployee[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const selected = employees.find((e) => e.id === selectedId) ?? null;

  if (employees.length === 0) {
    return (
      <div className={CARD}>
        <EmptyState
          icon={MapPinned}
          title="No field workers yet"
          text="Set an employee's work mode to Field (anywhere) from Employees, and their routes will show up here."
        />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q))
    : employees;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Roster */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className={`${CARD} p-3`}>
          {employees.length > 6 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          )}
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto lg:max-h-[calc(100vh-220px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
            {filtered.map((e) => {
              const active = e.id === selectedId;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors lg:w-full ${
                    active
                      ? "bg-orange-50 ring-1 ring-orange-200"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={e.name} size={34} />
                  <span className="min-w-0 leading-tight">
                    <span className={`block truncate text-sm ${active ? "font-semibold text-orange-700" : "font-medium text-slate-800"}`}>
                      {e.name}
                    </span>
                    <span className="block text-[11.5px] text-slate-500">{e.employeeCode}</span>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">No match.</p>}
          </div>
        </div>
      </aside>

      {/* Selected worker's day */}
      <section className="min-w-0">
        {selected ? (
          <VisitedPlacesPanel
            key={selected.id}
            userId={selected.id}
            employeeName={selected.name}
            employeeCode={selected.employeeCode}
          />
        ) : (
          <div className={CARD}>
            <EmptyState icon={MapPinned} title="Select a field worker" text="Pick someone to see where they went today." />
          </div>
        )}
      </section>
    </div>
  );
}
