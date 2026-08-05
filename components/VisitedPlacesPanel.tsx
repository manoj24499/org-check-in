"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";

const VisitedPlacesMap = dynamic(() => import("./VisitedPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full flex items-center justify-center bg-slate-100 text-sm text-secondary rounded-xl">
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

interface VisitedPlacesResponse {
  date: string;
  totalDistanceMeters: number;
  pings: { latitude: number; longitude: number; timestamp: string }[];
  visits: Visit[];
  mostRecentDataDate: string | null;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(startIso: string, endIso: string) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// `.toISOString().slice(0, 10)` converts to UTC first — for any timezone
// ahead of UTC (e.g. IST), local midnight rolls back to the previous UTC
// calendar day, silently shifting the date by one. Read the local
// year/month/day directly instead (same fix as the backend route).
function shiftDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Renders bare (no outer card) so it can be embedded as the detail side of
 * a master-detail layout — see components/FieldWorkersPanel.tsx, its only
 * caller. `employeeName` is shown next to the date nav for context, since
 * this component itself carries no heading of its own.
 */
export default function VisitedPlacesPanel({ userId, employeeName }: { userId: string; employeeName?: string }) {
  const [data, setData] = useState<VisitedPlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!targetDate && body.visits.length === 0 && body.mostRecentDataDate && body.mostRecentDataDate !== body.date) {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        {employeeName ? <h3 className="text-base font-bold text-slate-800">{employeeName}</h3> : <span />}
        {data && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDate(shiftDate(data.date, -1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4 text-slate-500" />
            </button>
            <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">
              {new Date(`${data.date}T00:00:00`).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            <button
              onClick={() => loadDate(shiftDate(data.date, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="h-[320px] flex items-center justify-center text-sm text-secondary">Loading…</div>
      ) : data ? (
        <>
          <div className="mb-4">
            <p className="text-xs font-bold text-secondary uppercase tracking-wider">Distance traveled</p>
            <p className="text-2xl font-black mt-1 text-slate-800">{formatDistance(data.totalDistanceMeters)}</p>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-200/60 mb-4">
            <VisitedPlacesMap pings={data.pings} visits={data.visits} />
          </div>

          {data.visits.length === 0 ? (
            <p className="text-sm text-secondary text-center py-6">No visits recorded for this day.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.visits.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {v.placeName ?? "Unknown place"}
                    </p>
                    <p className="text-xs text-secondary mt-0.5">
                      {formatTime(v.arrivedAt)} – {formatTime(v.departedAt)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-500 shrink-0">
                    {formatDuration(v.arrivedAt, v.departedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
