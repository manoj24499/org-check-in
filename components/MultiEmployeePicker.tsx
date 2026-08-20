"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type PickableEmployee = {
  id: string;
  employeeCode: string;
  name: string;
};

interface MultiEmployeePickerProps {
  employees: PickableEmployee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel?: string;
}

/** Search-and-select multiple employees at once — used by the Shifts admin
 * page's bulk-assign modal (see BulkAssignModal.tsx) to pick who a shift
 * applies to in one save. */
export default function MultiEmployeePicker({
  employees,
  selectedIds,
  onChange,
  emptyLabel,
}: MultiEmployeePickerProps) {
  const [query, setQuery] = useState("");

  const byId = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees],
  );
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((e): e is PickableEmployee => !!e);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? employees.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q),
        )
      : employees;
    return pool;
  }, [employees, query]);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((emp) => (
            <span
              key={emp.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 pl-3 pr-2 py-1 text-xs font-semibold text-primary"
            >
              {emp.name}
              <button
                type="button"
                onClick={() => toggle(emp.id)}
                className="rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                aria-label={`Remove ${emp.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or employee ID…"
          className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border-soft">
        {filtered.map((emp) => {
          const isSelected = selectedIds.includes(emp.id);
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => toggle(emp.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-3 ${
                isSelected ? "bg-primary/5" : "hover:bg-surface"
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                    isSelected ? "bg-primary border-primary" : "border-border"
                  }`}
                >
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-sm bg-white" />
                  )}
                </span>
                <span className="font-semibold text-foreground truncate">
                  {emp.name}
                </span>
              </span>
              <span className="text-secondary text-xs shrink-0">
                {emp.employeeCode}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-secondary text-sm">
            {emptyLabel ?? "No matching employees."}
          </div>
        )}
      </div>
    </div>
  );
}
