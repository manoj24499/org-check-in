"use client";

import { useState } from "react";
import { MapPin, User } from "lucide-react";
import VisitedPlacesPanel from "./VisitedPlacesPanel";

interface FieldEmployee {
  id: string;
  name: string;
  employeeCode: string;
}

export default function FieldWorkersPanel({
  employees,
}: {
  employees: FieldEmployee[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    employees[0]?.id ?? null,
  );
  const selected = employees.find((e) => e.id === selectedId) ?? null;

  return (
    // `md:h-[calc(100vh-200px)]` approximates "fill the viewport" below the
    // admin header + page title (both outside this component) — not pixel
    // exact, but enough to give the map/calendar a real height instead of
    // the old short, mostly-whitespace card. The employee list keeps its
    // own scroll so a long roster doesn't push the detail panel off-screen.
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6 md:h-[calc(100vh-200px)] md:min-h-[520px] md:flex md:flex-col">
      <div className="flex items-center gap-2.5 mb-4 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-medium text-foreground">Field workers</h2>
      </div>

      {employees.length === 0 ? (
        <p className="text-sm text-secondary py-6 text-center">
          No field workers yet — set an employee&apos;s work mode to
          &quot;Anywhere&quot; from Office Location to see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 md:flex-1 md:min-h-0">
          <div className="flex flex-col gap-1 md:overflow-y-auto md:pr-1">
            {employees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  e.id === selectedId
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted hover:bg-surface border border-transparent"
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </div>

          <div className="min-w-0 border-t md:border-t-0 md:border-l border-border pt-6 md:pt-0 md:pl-6 md:h-full md:min-h-0">
            {selected ? (
              <VisitedPlacesPanel
                key={selected.id}
                userId={selected.id}
                employeeName={selected.name}
              />
            ) : (
              <p className="text-sm text-secondary text-center py-6">
                Select a field worker to see their travel history.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
