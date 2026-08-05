"use client";

import { useState } from "react";
import { MapPin, User } from "lucide-react";
import VisitedPlacesPanel from "./VisitedPlacesPanel";

interface FieldEmployee {
  id: string;
  name: string;
  employeeCode: string;
}

export default function FieldWorkersPanel({ employees }: { employees: FieldEmployee[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(employees[0]?.id ?? null);
  const selected = employees.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white/60 backdrop-blur-md shadow-xl shadow-slate-200/20 p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Field workers</h2>
      </div>

      {employees.length === 0 ? (
        <p className="text-sm text-secondary py-6 text-center">
          No field workers yet — set an employee&apos;s work mode to &quot;Anywhere&quot; from Office Location to
          see them here.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6">
          <div className="flex flex-col gap-1">
            {employees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  e.id === selectedId
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-slate-600 hover:bg-slate-100 border border-transparent"
                }`}
              >
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{e.name}</span>
              </button>
            ))}
          </div>

          <div className="min-w-0 border-t md:border-t-0 md:border-l border-slate-200/60 pt-6 md:pt-0 md:pl-6">
            {selected ? (
              <VisitedPlacesPanel key={selected.id} userId={selected.id} employeeName={selected.name} />
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
