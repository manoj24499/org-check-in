"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export type PickableEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  active: boolean;
  workMode: "OFFICE" | "WFH" | "FIELD";
};

interface EmployeePickerProps {
  employees: PickableEmployee[];
  onSelect: (employee: PickableEmployee) => void;
  emptyLabel?: string;
}

/** Searchable employee list used inside "Add" modals (WFH / Anywhere tables) — not a full employee-management view, just a lightweight picker. */
export default function EmployeePicker({
  employees,
  onSelect,
  emptyLabel,
}: EmployeePickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or employee ID…"
          className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        />
      </div>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border-soft">
        {filtered.map((emp) => (
          <button
            key={emp.id}
            type="button"
            onClick={() => onSelect(emp)}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between"
          >
            <span className="font-semibold text-foreground">{emp.name}</span>
            <span className="text-secondary text-xs">{emp.employeeCode}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-secondary text-sm">
            {emptyLabel ?? "No matching employees."}
          </div>
        )}
      </div>
    </div>
  );
}
