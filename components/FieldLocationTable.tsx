"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Search } from "lucide-react";
import EmployeePicker, { type PickableEmployee } from "./EmployeePicker";

type FieldEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  active: boolean;
};

interface FieldLocationTableProps {
  employees: FieldEmployee[];
  allEmployees: PickableEmployee[];
}

export default function FieldLocationTable({
  employees,
  allEmployees,
}: FieldLocationTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q),
    );
  }, [employees, query]);

  // Anyone not already Anywhere is a valid candidate — converting from
  // OFFICE or WFH into FIELD is a legitimate reassignment.
  const candidates = useMemo(
    () => allEmployees.filter((e) => e.active && e.workMode !== "FIELD"),
    [allEmployees],
  );

  async function handleAdd(emp: PickableEmployee) {
    setPickerOpen(false);
    setError(null);
    const res = await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-field-mode" }),
    });
    if (!res.ok) {
      const data = await res
        .json()
        .catch(() => ({ error: "Something went wrong." }));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function handleRemove(emp: FieldEmployee) {
    if (
      !confirm(
        `Remove ${emp.name} from Anywhere mode? They will be reverted to Office mode.`,
      )
    ) {
      return;
    }
    setRemovingId(emp.id);
    await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-wfh-location" }),
    });
    setRemovingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium text-foreground tracking-tight">
            Anywhere (Field Workers)
          </h2>
          <p className="text-secondary mt-1 text-sm font-medium">
            No location range is enforced — these employees can check in from
            anywhere.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ID…"
          className="w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-secondary text-left border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Employee Name
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Employee ID
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Status
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-primary/5 transition-colors duration-200"
                >
                  <td className="px-6 py-4 text-foreground font-semibold">
                    {emp.name}
                  </td>
                  <td className="px-6 py-4 font-medium text-muted-2">
                    {emp.employeeCode}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${
                        emp.active
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-surface text-muted border border-border"
                      }`}
                    >
                      {emp.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemove(emp)}
                      disabled={removingId === emp.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {removingId === emp.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-secondary"
                  >
                    {employees.length === 0
                      ? "No field employees yet. Click Add to assign one."
                      : "No employees match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface-2 rounded-lg shadow-2xl border border-white/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-medium text-foreground">
                Add to Anywhere
              </h2>
              <button
                onClick={() => setPickerOpen(false)}
                className="text-muted hover:text-muted-2 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <EmployeePicker
                employees={candidates}
                onSelect={handleAdd}
                emptyLabel="No eligible employees — everyone active is already set to Anywhere mode."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
