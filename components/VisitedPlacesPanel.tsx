"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import VisitDatePicker from "./VisitDatePicker";

const VisitedPlacesMap = dynamic(() => import("./VisitedPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-surface text-sm text-secondary rounded-lg">
      Loading map…
    </div>
  ),
});

interface Visit {
  latitude: number;
  longitude: number;
  placeName: string | null;
  arrivedAt: string;
  departedAt: string;
}

interface FieldVisit {
  id: string;
  name: string;
  reachedAt: string;
  latitude: number;
  longitude: number;
}

interface ReimbursementRecord {
  distanceKm: number;
  ratePerKm: number;
  amount: number;
  note: string | null;
}

interface HoursSplit {
  fieldHours: number;
  officeHours: number;
}

interface VisitedPlacesResponse {
  date: string;
  totalDistanceMeters: number;
  // Only set once the day is complete (checked in and out) — see
  // /api/admin/employees/[id]/visited-places.
  hoursSplit: HoursSplit | null;
  pings: { latitude: number; longitude: number; timestamp: string }[];
  visits: Visit[];
  fieldVisits: FieldVisit[];
  mostRecentDataDate: string | null;
  defaultRatePerKm: number | null;
  reimbursement: ReimbursementRecord | null;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Renders bare (no outer card) so it can be embedded as the detail side of
 * a master-detail layout — see components/FieldWorkersPanel.tsx, its only
 * caller. `employeeName` is shown above the map/calendar for context, since
 * this component itself carries no heading of its own.
 */
export default function VisitedPlacesPanel({
  userId,
  employeeName,
}: {
  userId: string;
  employeeName?: string;
}) {
  const [data, setData] = useState<VisitedPlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rateInput, setRateInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingReimbursement, setSavingReimbursement] = useState(false);
  const [reimbursementError, setReimbursementError] = useState<string | null>(
    null,
  );
  const [reimbursementSaved, setReimbursementSaved] = useState(false);

  async function loadDate(targetDate?: string) {
    setLoading(true);
    setError(null);
    try {
      const url = targetDate
        ? `/api/admin/employees/${userId}/visited-places?date=${targetDate}`
        : `/api/admin/employees/${userId}/visited-places`;
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load.");

      // First load with no explicit date and nothing happened today —
      // jump to wherever the most recent location data actually is,
      // instead of defaulting to an empty "today".
      if (
        !targetDate &&
        body.visits.length === 0 &&
        body.fieldVisits.length === 0 &&
        body.mostRecentDataDate &&
        body.mostRecentDataDate !== body.date
      ) {
        await loadDate(body.mostRecentDataDate);
        return;
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Re-seed the reimbursement form whenever a different day's data loads —
  // prefer what was already saved for that day, falling back to the
  // distance-based suggestion using the admin's default rate.
  useEffect(() => {
    if (!data) return;
    const distanceKm = data.totalDistanceMeters / 1000;
    const rate = data.reimbursement?.ratePerKm ?? data.defaultRatePerKm ?? null;
    setRateInput(rate !== null ? String(rate) : "");
    const amount =
      data.reimbursement?.amount ??
      (rate !== null ? Math.round(distanceKm * rate * 100) / 100 : null);
    setAmountInput(amount !== null ? String(amount) : "");
    setNoteInput(data.reimbursement?.note ?? "");
    setReimbursementError(null);
    setReimbursementSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.date]);

  async function handleSaveReimbursement() {
    if (!data) return;
    const rate = Number(rateInput);
    const amount = Number(amountInput);
    if (Number.isNaN(rate) || rate < 0) {
      setReimbursementError("Enter a valid rate.");
      return;
    }
    if (Number.isNaN(amount) || amount < 0) {
      setReimbursementError("Enter a valid amount.");
      return;
    }

    setSavingReimbursement(true);
    setReimbursementError(null);
    setReimbursementSaved(false);

    const res = await fetch(`/api/admin/employees/${userId}/reimbursement`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: data.date,
        distanceKm: data.totalDistanceMeters / 1000,
        ratePerKm: rate,
        amount,
        note: noteInput.trim() || undefined,
      }),
    });
    const body = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setSavingReimbursement(false);

    if (!res.ok) {
      setReimbursementError(body.error ?? "Something went wrong.");
      return;
    }

    setReimbursementSaved(true);
    setData((prev) =>
      prev ? { ...prev, reimbursement: body.reimbursement } : prev,
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3 shrink-0">
        {employeeName && (
          <h3 className="text-base font-medium text-foreground">
            {employeeName}
          </h3>
        )}
        {data && (
          <p className="text-xs text-secondary mt-0.5">
            Viewing{" "}
            {new Date(`${data.date}T00:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100 mb-3 shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-[320px] flex items-center justify-center text-sm text-secondary">
          Loading…
        </div>
      ) : data ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Auto-detected stops (data.visits) still feed the map's pin
              markers below — only the standalone list of them was removed
              from this UI; the clustering/reverse-geocoding stays server-side. */}
          <div className="mb-3 flex flex-wrap gap-6 shrink-0">
            <div>
              <p className="text-xs font-medium text-secondary uppercase tracking-wider">
                Distance traveled
              </p>
              <p className="text-xl font-medium tracking-tight mt-1 text-foreground">
                {formatDistance(data.totalDistanceMeters)}
              </p>
            </div>
            {data.hoursSplit && (
              <>
                <div>
                  <p className="text-xs font-medium text-secondary uppercase tracking-wider">
                    Field hours
                  </p>
                  <p className="text-xl font-medium tracking-tight mt-1 text-foreground">
                    {formatHours(data.hoursSplit.fieldHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-secondary uppercase tracking-wider">
                    Office hours
                  </p>
                  <p className="text-xl font-medium tracking-tight mt-1 text-foreground">
                    {formatHours(data.hoursSplit.officeHours)}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Map takes the left half, the date-picker calendar the right
              half — replaces the old full-width map + prev/next-day arrows. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 lg:h-[42vh] lg:min-h-[320px]">
            {/* lg:min-h-0 overrides the grid item's default min-height:auto —
                without it, a tall child (the calendar) refuses to shrink to
                the row's explicit height and spills out below it. */}
            <div className="rounded-lg overflow-hidden border border-border h-[280px] lg:h-full lg:min-h-0">
              <VisitedPlacesMap
                pings={data.pings}
                visits={data.visits}
                fieldVisits={data.fieldVisits}
              />
            </div>
            <div className="rounded-lg border border-border p-3 lg:h-full lg:min-h-0 overflow-y-auto">
              <VisitDatePicker
                selectedDate={data.date}
                onSelect={(date) => loadDate(date)}
              />
            </div>
          </div>

          {/* "Logged by" and "Reimbursement" sit side by side — reimbursement
              takes the full row on days with no manually-logged stops. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4 items-start">
            {data.fieldVisits.length > 0 && (
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-2">
                  Logged by {employeeName ?? "employee"}
                </p>
                <div className="flex flex-col gap-2">
                  {data.fieldVisits.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/admin/field-visits/${v.id}/photo`}
                        alt={v.name}
                        className="w-11 h-11 rounded-lg object-cover border border-border shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {v.name}
                        </p>
                        <p className="text-xs text-secondary mt-0.5">
                          Reached {formatTime(v.reachedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`rounded-lg border border-border bg-surface p-4 ${
                data.fieldVisits.length === 0 ? "lg:col-span-2" : ""
              }`}
            >
              <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                Reimbursement for this day
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">
                    Rate (₹/km)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="mt-1 w-24 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">
                    Amount to pay (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="mt-1 w-28 rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                {rateInput.trim() !== "" && !Number.isNaN(Number(rateInput)) && (
                  <button
                    type="button"
                    onClick={() =>
                      setAmountInput(
                        String(
                          Math.round(
                            (data.totalDistanceMeters / 1000) *
                              Number(rateInput) *
                              100,
                          ) / 100,
                        ),
                      )
                    }
                    className="text-xs font-semibold text-primary hover:text-primary-dark transition mb-2"
                  >
                    Use {(data.totalDistanceMeters / 1000).toFixed(1)} km × ₹
                    {rateInput} = ₹
                    {(
                      Math.round(
                        (data.totalDistanceMeters / 1000) *
                          Number(rateInput) *
                          100,
                      ) / 100
                    ).toFixed(2)}
                  </button>
                )}
              </div>

              <div className="mt-3">
                <label className="text-xs font-medium text-muted">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. includes toll charges"
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                />
              </div>

              {reimbursementError && (
                <div className="mt-3 rounded-lg bg-red-50 text-red-600 p-2.5 text-sm border border-red-100">
                  {reimbursementError}
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleSaveReimbursement}
                  disabled={savingReimbursement}
                  className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-primary/5 transition disabled:opacity-50"
                >
                  {savingReimbursement
                    ? "Saving…"
                    : data.reimbursement
                      ? "Update"
                      : "Save"}
                </button>
                {reimbursementSaved && !reimbursementError && (
                  <span className="text-sm text-emerald-600 font-medium">
                    Saved.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
