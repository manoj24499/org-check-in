"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  CalendarDays,
  Camera,
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  IndianRupee,
  Mail,
  MapPin,
  Phone,
  Route,
  Square,
  Timer,
  User,
} from "lucide-react";
import VisitDatePicker from "./VisitDatePicker";
import { Avatar, BTN_PRIMARY, CARD, IconChip, type Tone } from "./admin/ui";
import type { TrailPoint, VisitedPlace } from "./VisitedPlacesMap";

const VisitedPlacesMap = dynamic(() => import("./VisitedPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

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
  places: VisitedPlace[];
  start: TrailPoint | null;
  end: TrailPoint | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  fieldVisits: { id: string }[];
  odometer: { startKm: number | null; endKm: number | null; distanceKm: number | null } | null;
  mostRecentDataDate: string | null;
  defaultRatePerKm: number | null;
  reimbursement: ReimbursementRecord | null;
}

type DistanceBasis = "odometer" | "gps";

/** Kilometres the reimbursement is based on: the odometer reading when both
 * start and end were entered and the admin picked it, otherwise the GPS total. */
function claimedKm(d: { totalDistanceMeters: number; odometer: { distanceKm: number | null } | null }, basis: DistanceBasis) {
  const odo = d.odometer?.distanceKm ?? null;
  return basis === "odometer" && odo != null ? odo : d.totalDistanceMeters / 1000;
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
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatStay(ms: number) {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

// Date keys are plain calendar dates, so step them in UTC to avoid DST/zone drift.
function shiftDate(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function Metric({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof MapPin;
  tone: Tone;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={`${CARD} flex items-center gap-3.5 p-4`}>
      <IconChip icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-slate-500">{label}</p>
        <p className="truncate text-[22px] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-slate-900">{value}</p>
        {hint && <p className="truncate text-[11.5px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Detail side of the Field workers page (see components/FieldWorkersPanel.tsx,
 * its only caller): one employee's day — headline numbers, the route map with
 * the starting point and each distinct place numbered, a journey timeline that
 * drives the map, a date picker, and the day's reimbursement.
 */
export default function VisitedPlacesPanel({
  userId,
  employeeName,
  employeeCode,
}: {
  userId: string;
  employeeName?: string;
  employeeCode?: string;
}) {
  const [data, setData] = useState<VisitedPlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusOrder, setFocusOrder] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Which distance the reimbursement is calculated from — the odometer (start/end km the
  // employee entered) is the default whenever both readings exist.
  const [basis, setBasis] = useState<DistanceBasis>("odometer");
  const calendarRef = useRef<HTMLDivElement>(null);

  const [rateInput, setRateInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [savingReimbursement, setSavingReimbursement] = useState(false);
  const [reimbursementError, setReimbursementError] = useState<string | null>(null);
  const [reimbursementSaved, setReimbursementSaved] = useState(false);

  async function loadDate(targetDate?: string) {
    setLoading(true);
    setError(null);
    setFocusOrder(null);
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
        body.places.length === 0 &&
        body.pings.length === 0 &&
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
    const distanceKm = claimedKm(data, "odometer");
    const rate = data.reimbursement?.ratePerKm ?? data.defaultRatePerKm ?? null;
    setRateInput(rate !== null ? String(rate) : "");
    const amount =
      data.reimbursement?.amount ?? (rate !== null ? Math.round(distanceKm * rate * 100) / 100 : null);
    setAmountInput(amount !== null ? String(amount) : "");
    setNoteInput(data.reimbursement?.note ?? "");
    setBasis("odometer");
    setReimbursementError(null);
    setReimbursementSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.date]);

  // The calendar is a popover off the date chip: close on Escape or a click outside.
  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!calendarRef.current?.contains(e.target as Node)) setCalendarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [calendarOpen]);

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
        distanceKm: claimedKm(data, basis),
        ratePerKm: rate,
        amount,
        note: noteInput.trim() || undefined,
      }),
    });
    const body = await res.json().catch(() => ({ error: "Unexpected server response." }));
    setSavingReimbursement(false);

    if (!res.ok) {
      setReimbursementError(body.error ?? "Something went wrong.");
      return;
    }

    setReimbursementSaved(true);
    setData((prev) => (prev ? { ...prev, reimbursement: body.reimbursement } : prev));
  }

  const todayKey = new Date().toLocaleDateString("en-CA");
  const places = data?.places ?? [];
  // Every hand-logged stop of the day, flattened with its place number, for the details card.
  const visitDetails = places.flatMap((p) => p.logged.map((v) => ({ ...v, order: p.order })));
  const startedAt = data?.checkInAt ?? data?.start?.timestamp ?? null;
  const input =
    "mt-1 rounded-xl border border-black/10 bg-slate-50 px-3 py-2 text-sm transition-colors focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30";

  return (
    <div className="flex flex-col gap-5">
      {/* Employee + day navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {employeeName && <Avatar name={employeeName} size={42} />}
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-slate-900">{employeeName}</h3>
            {employeeCode && <p className="text-xs text-slate-500">{employeeCode} · Field worker</p>}
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => loadDate(shiftDate(data.date, -1))}
              aria-label="Previous day"
              className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div ref={calendarRef} className="relative">
              <button
                onClick={() => setCalendarOpen((o) => !o)}
                aria-expanded={calendarOpen}
                aria-haspopup="dialog"
                className={`flex min-w-[170px] items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 ${
                  calendarOpen ? "border-orange-300 ring-2 ring-orange-500/20" : "border-black/10"
                }`}
              >
                <CalendarDays className="h-4 w-4 text-orange-600" />
                {new Date(`${data.date}T00:00:00`).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${calendarOpen ? "rotate-180" : ""}`} />
              </button>
              {calendarOpen && (
                <div
                  role="dialog"
                  aria-label="Pick a date"
                  className={`${CARD} absolute right-0 top-full z-40 mt-2 w-[310px] p-4 shadow-xl`}
                >
                  <VisitDatePicker
                    userId={userId}
                    selectedDate={data.date}
                    onSelect={(date) => {
                      setCalendarOpen(false);
                      loadDate(date);
                    }}
                  />
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    Logged a field visit
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => loadDate(shiftDate(data.date, 1))}
              disabled={data.date >= todayKey}
              aria-label="Next day"
              className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {data.date !== todayKey && (
              <button
                onClick={() => loadDate(todayKey)}
                className="ml-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50"
              >
                Today
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {loading ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-slate-500">Loading…</div>
      ) : data ? (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              icon={MapPin}
              tone="indigo"
              label="Places covered"
              value={String(places.length)}
              hint={
                places.length === 0
                  ? "No stops detected"
                  : `${places.filter((p) => p.logged.length > 0).length} logged manually`
              }
            />
            <Metric
              icon={Route}
              tone="orange"
              label="Distance travelled"
              value={formatDistance(data.totalDistanceMeters)}
              hint={
                data.odometer
                  ? data.odometer.distanceKm != null
                    ? `Odometer: ${data.odometer.distanceKm} km`
                    : "Odometer: awaiting end km"
                  : "From GPS"
              }
            />
            <Metric
              icon={Flag}
              tone="green"
              label="Started at"
              value={startedAt ? formatTime(startedAt) : "—"}
              hint={data.checkOutAt ? `Finished ${formatTime(data.checkOutAt)}` : startedAt ? "Still in the field" : undefined}
            />
            <Metric
              icon={Timer}
              tone="slate"
              label="Field hours"
              value={data.hoursSplit ? formatHours(data.hoursSplit.fieldHours) : "—"}
              hint={data.hoursSplit ? `Office ${formatHours(data.hoursSplit.officeHours)}` : "Shown once checked out"}
            />
          </div>

          {/* Row 1: map | journey (same height). Row 2: reimbursement | visit details. */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className={`${CARD} overflow-hidden p-1.5`}>
                <div className="h-[380px] overflow-hidden rounded-xl sm:h-[480px]">
                  <VisitedPlacesMap
                    pings={data.pings}
                    places={places}
                    start={data.start}
                    end={data.end}
                    focusOrder={focusOrder}
                    onSelectPlace={setFocusOrder}
                  />
                </div>
              </div>

              {/* Journey timeline — clicking a stop flies the map to it */}
              <div className={`${CARD} flex flex-col p-5 xl:h-[492px]`}>
                <p className="mb-4 text-sm font-semibold text-slate-900">Journey</p>
                {places.length === 0 && !data.start ? (
                  <p className="py-4 text-center text-sm text-slate-500">Nothing recorded for this day.</p>
                ) : (
                  <ol className="relative flex max-h-[420px] flex-col gap-0.5 overflow-y-auto pr-1 xl:max-h-none xl:min-h-0 xl:flex-1">
                    {data.start && (
                      <li className="flex gap-3 pb-4">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green-600 text-white shadow-sm">
                          <Flag className="h-3.5 w-3.5" />
                        </span>
                        <div className="pt-0.5">
                          <p className="text-sm font-medium text-slate-900">Starting point</p>
                          <p className="text-xs text-slate-500">{formatTime(data.start.timestamp)}</p>
                        </div>
                      </li>
                    )}
                    {places.map((p) => {
                      const active = focusOrder === p.order;
                      const logged = p.logged.length > 0;
                      return (
                        <li key={p.order}>
                          <button
                            onClick={() => setFocusOrder(p.order)}
                            className={`flex w-full gap-3 rounded-xl p-2 -m-2 mb-2 text-left transition-colors ${
                              active ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow-sm ${
                                logged ? "bg-orange-600" : "bg-indigo-600"
                              }`}
                            >
                              {p.order}
                            </span>
                            <span className="min-w-0 flex-1 pt-0.5">
                              <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(p.arrivedAt)}
                                  {p.departedAt !== p.arrivedAt ? ` – ${formatTime(p.departedAt)}` : ""}
                                </span>
                                {formatStay(p.durationMs) && <span>· {formatStay(p.durationMs)}</span>}
                                {p.stays > 1 && <span>· visited {p.stays}×</span>}
                              </span>
                              {p.logged.map((v) => (
                                <span key={v.id} className="mt-1.5 flex items-start gap-2">
                                  {v.hasPhoto ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={`/api/admin/field-visits/${v.id}/photo`}
                                      alt={v.name}
                                      className="h-10 w-10 shrink-0 rounded-lg border border-black/10 object-cover"
                                    />
                                  ) : (
                                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-black/10 bg-slate-50 text-slate-400">
                                      <Camera className="h-4 w-4" />
                                    </span>
                                  )}
                                  <span className="min-w-0 text-xs text-slate-600">
                                    {v.name !== p.name && <span className="block font-medium text-slate-700">{v.name}</span>}
                                    {v.description && <span className="block whitespace-pre-line break-words">{v.description}</span>}
                                  </span>
                                </span>
                              ))}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {data.end && (
                      <li className="flex gap-3 pt-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-white shadow-sm">
                          <Square className="h-3 w-3 fill-white" />
                        </span>
                        <div className="pt-0.5">
                          <p className="text-sm font-medium text-slate-900">{data.checkOutAt ? "Last location" : "Last seen"}</p>
                          <p className="text-xs text-slate-500">{formatTime(data.end.timestamp)}</p>
                        </div>
                      </li>
                    )}
                  </ol>
                )}
              </div>
              {/* Reimbursement */}
              <div className={`${CARD} self-start p-5`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <IconChip icon={IndianRupee} tone="green" size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Reimbursement for this day</p>
                    <p className="text-xs text-slate-500">
                      Based on {claimedKm(data, basis).toFixed(1)} km
                      {basis === "odometer" && data.odometer?.distanceKm != null ? " (odometer)" : " (GPS)"}
                    </p>
                  </div>
                </div>

                {/* Odometer readings the employee entered at check-in / check-out */}
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "Start km", value: data.odometer?.startKm ?? null, unit: "" },
                    { label: "End km", value: data.odometer?.endKm ?? null, unit: "" },
                    { label: "Odometer distance", value: data.odometer?.distanceKm ?? null, unit: "km" },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-slate-500">{m.label}</p>
                      <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-slate-900">
                        {m.value != null ? m.value : "—"}
                        {m.value != null && m.unit ? <span className="ml-1 text-xs font-medium text-slate-500">{m.unit}</span> : null}
                      </p>
                    </div>
                  ))}
                </div>

                {data.odometer?.distanceKm != null && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Calculate from</span>
                    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                      {([
                        { key: "odometer", label: `Odometer · ${data.odometer.distanceKm} km` },
                        { key: "gps", label: `GPS · ${(data.totalDistanceMeters / 1000).toFixed(1)} km` },
                      ] as const).map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => {
                            setBasis(o.key);
                            const rate = Number(rateInput);
                            if (rateInput.trim() !== "" && !Number.isNaN(rate)) {
                              setAmountInput(String(Math.round(claimedKm(data, o.key) * rate * 100) / 100));
                            }
                          }}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            basis === o.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Rate (₹/km)</label>
                    <input type="number" min={0} step="0.5" value={rateInput} onChange={(e) => setRateInput(e.target.value)} className={`${input} w-28`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Amount to pay (₹)</label>
                    <input type="number" min={0} step="1" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} className={`${input} w-32`} />
                  </div>
                  {rateInput.trim() !== "" && !Number.isNaN(Number(rateInput)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setAmountInput(String(Math.round(claimedKm(data, basis) * Number(rateInput) * 100) / 100))
                      }
                      className="mb-2 text-xs font-semibold text-orange-600 transition hover:text-orange-700"
                    >
                      Use {claimedKm(data, basis).toFixed(1)} km × ₹{rateInput} = ₹
                      {(Math.round(claimedKm(data, basis) * Number(rateInput) * 100) / 100).toFixed(2)}
                    </button>
                  )}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600">Note (optional)</label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="e.g. includes toll charges"
                    className={`${input} w-full`}
                  />
                </div>

                {reimbursementError && (
                  <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-2.5 text-sm text-red-600">{reimbursementError}</div>
                )}

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={handleSaveReimbursement} disabled={savingReimbursement} className={`${BTN_PRIMARY} disabled:opacity-50`}>
                    {savingReimbursement ? "Saving…" : data.reimbursement ? "Update" : "Save"}
                  </button>
                  {reimbursementSaved && !reimbursementError && (
                    <span className="text-sm font-medium text-emerald-600">Saved.</span>
                  )}
                </div>
              </div>
              {/* Visit details — odometer plus each logged stop's contact person, phone, email and remarks */}
              <div className={`${CARD} p-5`}>
                <div className="mb-4 flex items-center gap-2.5">
                  <IconChip icon={ClipboardList} tone="indigo" size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Visit details</p>
                    <p className="text-xs text-slate-500">Contact person, phone, email and remarks logged on this day</p>
                  </div>
                </div>

                {visitDetails.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-500">No logged locations on this day.</p>
                ) : (
                  <ul className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                    {visitDetails.map((v) => {
                      const hasContact = v.contactName || v.contactPhone || v.contactEmail;
                      return (
                        <li key={v.id} className="rounded-xl border border-black/[0.07] p-3">
                          <div className="flex items-start gap-3">
                            {v.hasPhoto ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/admin/field-visits/${v.id}/photo`}
                                alt={v.name}
                                className="h-12 w-12 shrink-0 rounded-lg border border-black/10 object-cover"
                              />
                            ) : (
                              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-black/10 bg-slate-50 text-slate-400">
                                <Camera className="h-4 w-4" />
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{v.name}</p>
                              <p className="text-xs text-slate-500">
                                Stop {v.order} · reached {formatTime(v.reachedAt)}
                              </p>
                            </div>
                          </div>

                          {v.description && (
                            <p className="mt-2 whitespace-pre-line break-words text-xs text-slate-600">{v.description}</p>
                          )}

                          {hasContact ? (
                            <div className="mt-2 flex flex-col gap-1 text-xs text-slate-700">
                              {v.contactName && (
                                <span className="inline-flex items-center gap-1.5">
                                  <User className="h-3.5 w-3.5 text-slate-400" />
                                  {v.contactName}
                                </span>
                              )}
                              {v.contactPhone && (
                                <a
                                  href={`tel:${v.contactPhone.replace(/\s/g, "")}`}
                                  className="inline-flex items-center gap-1.5 text-orange-700 hover:underline"
                                >
                                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                                  {v.contactPhone}
                                </a>
                              )}
                              {v.contactEmail && (
                                <a
                                  href={`mailto:${v.contactEmail}`}
                                  className="inline-flex items-center gap-1.5 break-all text-orange-700 hover:underline"
                                >
                                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                                  {v.contactEmail}
                                </a>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">No contact details added.</p>
                          )}

                          {v.remarks && (
                            <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                              <span className="font-medium text-slate-700">Remarks: </span>
                              {v.remarks}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
