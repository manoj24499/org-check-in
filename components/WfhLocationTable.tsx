"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, Plus, Search } from "lucide-react";
import EmployeePicker, { type PickableEmployee } from "./EmployeePicker";

const OfficeLocationMap = dynamic(() => import("./OfficeLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full flex items-center justify-center bg-surface text-sm text-secondary">
      Loading map…
    </div>
  ),
});

type WfhEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  active: boolean;
  homeLatitude: number | null;
  homeLongitude: number | null;
  homeRadiusMeters: number;
};

interface WfhLocationTableProps {
  employees: WfhEmployee[];
  allEmployees: PickableEmployee[];
}

export default function WfhLocationTable({
  employees,
  allEmployees,
}: WfhLocationTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<WfhEmployee | null>(null);
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [radiusMeters, setRadiusMeters] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.employeeCode.toLowerCase().includes(q),
    );
  }, [employees, query]);

  // Anyone not already WFH is a valid candidate — converting from OFFICE or
  // FIELD into WFH is a legitimate reassignment.
  const candidates = useMemo(
    () => allEmployees.filter((e) => e.active && e.workMode !== "WFH"),
    [allEmployees],
  );

  function openEdit(emp: WfhEmployee) {
    setEditing(emp);
    setLatitude(emp.homeLatitude ?? 0);
    setLongitude(emp.homeLongitude ?? 0);
    setRadiusMeters(emp.homeRadiusMeters ?? 50);
    setError(null);
  }

  function openAdd(emp: PickableEmployee) {
    setPickerOpen(false);
    openEdit({
      id: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      active: emp.active,
      homeLatitude: null,
      homeLongitude: null,
      homeRadiusMeters: 50,
    });
  }

  async function handleSave() {
    if (!editing) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/employees/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-wfh-location",
        latitude,
        longitude,
        radiusMeters,
      }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setEditing(null);
    router.refresh();
  }

  async function handleDelete(emp: WfhEmployee) {
    if (
      !confirm(
        `Remove the WFH location for ${emp.name}? They will be reverted to Office mode.`,
      )
    ) {
      return;
    }
    setDeletingId(emp.id);
    await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-wfh-location" }),
    });
    setDeletingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium text-foreground tracking-tight">
            Work From Home Locations
          </h2>
          <p className="text-secondary mt-1 text-sm font-medium">
            WFH employees are geofenced against their own home location instead
            of the office.
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
                  Latitude
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Longitude
                </th>
                <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">
                  Allowed Radius
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
                  <td className="px-6 py-4 text-secondary">
                    {emp.homeLatitude?.toFixed(5) ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-secondary">
                    {emp.homeLongitude?.toFixed(5) ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-secondary">
                    {Math.round(emp.homeRadiusMeters)}m
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
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => openEdit(emp)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-2 hover:bg-black/[0.03] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(emp)}
                        disabled={deletingId === emp.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingId === emp.id ? "Removing…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-secondary"
                  >
                    {employees.length === 0
                      ? "No WFH employees yet. Click Add to assign one."
                      : "No employees match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg bg-surface-2 rounded-lg shadow-2xl border border-white/50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-medium text-foreground">
                {editing.homeLatitude === null ? "Set" : "Edit"} home location —{" "}
                {editing.name}
              </h2>
              <button
                onClick={() => setEditing(null)}
                className="text-muted hover:text-muted-2 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <OfficeLocationMap
              latitude={latitude}
              longitude={longitude}
              radiusMeters={radiusMeters}
              onChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />

            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-2">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-2">
                  Allowed radius (meters)
                </label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={radiusMeters}
                  onChange={(e) => setRadiusMeters(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 rounded-lg bg-white border border-border py-2.5 text-sm font-medium text-muted hover:bg-surface transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                Add a WFH employee
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
                onSelect={openAdd}
                emptyLabel="No eligible employees — everyone active is already set to WFH."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
