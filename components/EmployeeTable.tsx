"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, ChevronRight, Users } from "lucide-react";
import { Avatar, BTN_SECONDARY, CARD, EmptyState, Pill, TABLE } from "./admin/ui";

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
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search by name, email, or ID…"
              className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
          </div>
          <p className="text-[13px] text-slate-500">
            <span className="font-semibold tabular-nums text-slate-800">{total}</span> {total === 1 ? "employee" : "employees"}
            {debouncedQuery ? " found" : ""}
          </p>
        </div>

        {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}

        <div className={TABLE.wrap}>
          <table className={TABLE.table}>
            <thead className={TABLE.thead}>
              <tr>
                <th className={TABLE.th}>Employee</th>
                <th className={TABLE.th}>ID</th>
                <th className={TABLE.th}>Email</th>
                <th className={TABLE.th}>Status</th>
                <th className={`${TABLE.th} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className={TABLE.tbody}>
              {employees.map((emp) => (
                <tr key={emp.id} className={TABLE.tr}>
                  <td className={TABLE.td}>
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.name} />
                      <p className="max-w-[200px] truncate font-medium text-slate-900">{emp.name}</p>
                    </div>
                  </td>
                  <td className={`${TABLE.td} font-mono text-[13px] text-slate-600`}>{emp.employeeCode}</td>
                  <td className={`${TABLE.td} max-w-[260px] truncate text-slate-500`}>{emp.email}</td>
                  <td className={TABLE.td}>
                    <Pill tone={emp.active ? "green" : "slate"} dot>
                      {emp.active ? "Active" : "Deactivated"}
                    </Pill>
                  </td>
                  <td className={`${TABLE.td} text-right`}>
                    <Link
                      href={`/admin/employees/${emp.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-orange-300 hover:text-orange-600"
                    >
                      Manage
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 && !loading && (
            <EmptyState
              icon={Users}
              title={total === 0 && !debouncedQuery ? "No employees yet" : "No employees match your search"}
              text={
                total === 0 && !debouncedQuery
                  ? "Add your first employee, or import a whole team at once with Bulk add."
                  : "Check the spelling or try a name, email or employee ID."
              }
            />
          )}
        </div>
      </div>

      {/* Only shown once there's more than one page's worth — no need to
          clutter the UI for the common small-roster case. */}
      {total > pageSize && (
        <div className="flex items-center justify-between px-1 text-sm text-slate-500">
          <span>
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goToPage(Math.max(1, page - 1))}
              className={`${BTN_SECONDARY} !px-3.5 !py-1.5 !text-xs`}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
              className={`${BTN_SECONDARY} !px-3.5 !py-1.5 !text-xs`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
