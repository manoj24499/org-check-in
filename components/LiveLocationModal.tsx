"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Clock, MapPin, MapPinned, RefreshCw, Route, X } from "lucide-react";
import FullscreenMapFrame from "./FullscreenMapFrame";
import { Avatar, Pill } from "./admin/ui";
import type { TrailPoint, VisitedPlace } from "./VisitedPlacesMap";

const VisitedPlacesMap = dynamic(() => import("./VisitedPlacesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">Loading map…</div>
  ),
});

const REFRESH_MS = 30_000;

export interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
}

interface DayData {
  totalDistanceMeters: number;
  currentMode: string | null;
  workMode?: string;
  pings: { latitude: number; longitude: number; timestamp: string }[];
  places: VisitedPlace[];
  start: TrailPoint | null;
  end: TrailPoint | null;
  checkInAt: string | null;
  checkOutAt: string | null;
}

const MODE_LABEL: Record<string, string> = {
  OFFICE: "At office",
  FIELD: "In the field",
  HOME: "Working from home",
  TRANSIT: "In transit",
};

function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ${mins % 60} min ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function distance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * The dashboard's "where is this person" view — the same map the Field workers page uses (today's route, stops,
 * start/end, satellite layer, fullscreen), plus a pulsing blue dot on the latest ping. It refreshes itself every
 * 30 seconds, and the dot also follows the dashboard's own live location feed (`location`), so it moves as new
 * pings arrive without the admin reopening it.
 */
export default function LiveLocationModal({
  employeeId,
  employeeName,
  employeeCode,
  location,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  /** Latest ping from the dashboard's live feed; updates while the modal is open. */
  location: LiveLocation;
  onClose: () => void;
}) {
  const [data, setData] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/employees/${employeeId}/visited-places`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      setData((await res.json()) as DayData);
      setError(null);
    } catch {
      setError("Couldn't refresh the route. Showing the last known position.");
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mode = data?.currentMode ? MODE_LABEL[data.currentMode] ?? data.currentMode : null;
  // Distance and stops only mean something for people who travel; everyone else just sits at one place.
  const isField = data?.workMode === "FIELD";
  const stale = now - new Date(location.timestamp).getTime() > 15 * 60_000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-[min(88vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-black/5 px-5 py-4">
          <Avatar name={employeeName} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900">
              {employeeName} <span className="font-normal text-slate-500">· {employeeCode}</span>
            </p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`inline-block h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
              {stale ? "Last seen" : "Live"} · {ago(location.timestamp, now)}
            </p>
          </div>
          {mode && <Pill tone={data?.currentMode === "TRANSIT" ? "amber" : "orange"}>{mode}</Pill>}
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label="Refresh"
            className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 text-slate-600 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The map takes whatever height is left, so the whole view fits on screen with no scrolling. */}
        <div className="min-h-0 flex-1 p-1.5">
          <FullscreenMapFrame className="h-full">
            <VisitedPlacesMap
              pings={data?.pings ?? []}
              places={data?.places ?? []}
              start={data?.start ?? null}
              end={data?.end ?? null}
              live={{ ...location, label: employeeName }}
              fitOnce
            />
          </FullscreenMapFrame>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-black/5 px-5 py-2.5 text-xs">
          <Stat icon={MapPin} label="Position" value={`${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} (±${Math.round(location.accuracy)} m)`} />
          <Stat
            icon={Clock}
            label="Checked in"
            value={
              data?.checkInAt
                ? new Date(data.checkInAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) +
                  (data.checkOutAt ? " · checked out" : "")
                : "—"
            }
          />
          {isField && <Stat icon={Route} label="Distance" value={data ? distance(data.totalDistanceMeters) : "—"} />}
          {isField && <Stat icon={MapPinned} label="Stops" value={data ? String(data.places.length) : "—"} />}
          {error && <span className="ml-auto text-amber-700">{error}</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
      <span className="truncate font-semibold tabular-nums text-slate-900">{value}</span>
    </span>
  );
}
