"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  active: boolean;
};

type EmployeesResponse = {
  employees: Employee[];
  total: number;
  page: number;
  pageSize: number;
};

// Keeps typing from firing a request per keystroke — matched to the
// mobile app's own search-adjacent debounce conventions.
const SEARCH_DEBOUNCE_MS = 300;

export default function EmployeeTable({
  initialEmployees,
  initialTotal,
  pageSize,
}: {
  initialEmployees: Employee[];
  initialTotal: number;
  pageSize: number;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [fetched, setFetched] = useState<{ employees: Employee[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup only — no setState in the effect body itself, just clearing a
  // pending debounce timer if the component unmounts mid-wait.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Page 1 with no search term is exactly what the server already rendered
  // into `initialEmployees`/`initialTotal` (see app/admin/employees/page.tsx)
  // — nothing to fetch, `load` below returns immediately for this case and
  // the render further down falls back to those props directly.
  async function load(targetPage: number, q: string) {
    if (targetPage === 1 && q === "") return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/employees?${params.toString()}`);
      if (!res.ok) throw new Error("Request failed");
      const data: EmployeesResponse = await res.json();
      setFetched({ employees: data.employees, total: data.total });
    } catch {
      setError("Couldn't load employees. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // A new search term always jumps back to page 1 — otherwise searching
    // while sitting on page 3 could land on an empty page even though real
    // matches exist earlier.
    debounceTimer.current = setTimeout(() => {
      const trimmed = value.trim();
      setDebouncedQuery(trimmed);
      setPage(1);
      void load(1, trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    void load(nextPage, debouncedQuery);
  }

  const isDefaultView = page === 1 && debouncedQuery === "";
  const employees = isDefaultView ? initialEmployees : (fetched?.employees ?? []);
  const total = isDefaultView ? initialTotal : (fetched?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name, email, or ID…"
          className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted animate-spin" />
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

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
              {employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-primary/5 transition-colors duration-200"
                >
                  <td className="px-6 py-4 font-medium text-muted-2">
                    {emp.employeeCode}
                  </td>
                  <td className="px-6 py-4 text-foreground font-semibold max-w-[180px] truncate">
                    {emp.name}
                  </td>
                  <td className="px-6 py-4 text-secondary max-w-[220px] truncate">{emp.email}</td>
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
              {employees.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-secondary"
                  >
                    {total === 0 && !debouncedQuery
                      ? "No employees found. Add some to get started!"
                      : "No employees match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Only shown once there's more than one page's worth — no need to
          clutter the UI for the common small-roster case. */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-secondary px-1">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(Math.max(1, page - 1))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
