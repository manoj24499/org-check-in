"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  active: boolean;
};

export default function EmployeeTable({
  employees,
}: {
  employees: Employee[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or ID…"
          className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        />
      </div>

      <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-secondary text-left border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  ID
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Name
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Email
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Status
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-primary/5 transition-colors duration-200"
                >
                  <td className="px-6 py-4 font-medium text-muted-2">
                    {emp.employeeCode}
                  </td>
                  <td className="px-6 py-4 text-foreground font-semibold">
                    {emp.name}
                  </td>
                  <td className="px-6 py-4 text-secondary">{emp.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${
                        emp.active
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-surface text-muted border border-border"
                      }`}
                    >
                      {emp.active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/employees/${emp.id}`}
                      className="inline-flex items-center justify-center rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-secondary"
                  >
                    {employees.length === 0
                      ? "No employees found. Add some to get started!"
                      : "No employees match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
