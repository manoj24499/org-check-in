"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface VisitedPlacesPing {
  latitude: number;
  longitude: number;
}

export interface LoggedVisit {
  id: string;
  name: string;
  description: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  remarks: string | null;
  reachedAt: string;
  hasPhoto: boolean;
}

/** One distinct place the worker went to — GPS stops and hand-logged visits
 * already merged server-side (lib/visitedPlaces.ts). */
export interface VisitedPlace {
  order: number;
  latitude: number;
  longitude: number;
  name: string;
  arrivedAt: string;
  departedAt: string;
  durationMs: number;
  stays: number;
  logged: LoggedVisit[];
}

export interface TrailPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function durationLabel(ms: number) {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function esc(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function numberIcon(order: number, logged: boolean, active: boolean) {
  const bg = logged ? "#ea580c" : "#4f46e5";
  const size = active ? 32 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font:600 ${active ? 13 : 11.5}px/1 system-ui,sans-serif;${active ? "outline:3px solid " + bg + "55;" : ""}">${order}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Start: a green flag chip with a pulsing ring so the day's origin is the
// first thing the eye finds; End: a dark chip.
const startIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:38px;height:38px">
    <span class="vp-pulse" style="position:absolute;inset:0;border-radius:50%;background:#16a34a55"></span>
    <div style="position:absolute;inset:5px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M6 3v18M6 4h12l-2.5 4L18 12H6" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>
    </div></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -18],
});
const endIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;border-radius:7px;background:#0f172a;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><div style="width:8px;height:8px;border-radius:2px;background:#fff"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  return null;
}

/** Pans to the place the admin picked in the timeline and opens its popup. */
function Focus({ order, places, markers }: { order: number | null; places: VisitedPlace[]; markers: React.MutableRefObject<Map<number, L.Marker>> }) {
  const map = useMap();
  useEffect(() => {
    if (order === null) return;
    const p = places.find((x) => x.order === order);
    if (!p) return;
    map.flyTo([p.latitude, p.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
    const t = window.setTimeout(() => markers.current.get(order)?.openPopup(), 650);
    return () => window.clearTimeout(t);
  }, [order, places, map, markers]);
  return null;
}

export default function VisitedPlacesMap({
  pings,
  places,
  start,
  end,
  focusOrder = null,
  onSelectPlace,
}: {
  pings: VisitedPlacesPing[];
  places: VisitedPlace[];
  start: TrailPoint | null;
  end: TrailPoint | null;
  focusOrder?: number | null;
  onSelectPlace?: (order: number) => void;
}) {
  const markers = useRef(new Map<number, L.Marker>());
  const path = useMemo<[number, number][]>(() => pings.map((p) => [p.latitude, p.longitude]), [pings]);
  const bounds = useMemo<[number, number][]>(
    () => [...path, ...places.map((p) => [p.latitude, p.longitude] as [number, number])],
    [path, places],
  );

  if (bounds.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        No location data for this day.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer center={bounds[0]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={bounds} />
        <Focus order={focusOrder} places={places} markers={markers} />

        {/* White casing under the route keeps it readable on busy map tiles. */}
        {path.length > 1 && (
          <>
            <Polyline positions={path} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
            <Polyline positions={path} pathOptions={{ color: "#ea580c", weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
          </>
        )}

        {places.map((p) => (
          <Marker
            key={p.order}
            position={[p.latitude, p.longitude]}
            icon={numberIcon(p.order, p.logged.length > 0, focusOrder === p.order)}
            zIndexOffset={focusOrder === p.order ? 900 : 500}
            ref={(m) => {
              if (m) markers.current.set(p.order, m);
              else markers.current.delete(p.order);
            }}
            eventHandlers={{ click: () => onSelectPlace?.(p.order) }}
          >
            <Popup>
              <div style={{ minWidth: 170, maxWidth: 230 }}>
                <strong>
                  {p.order}. {p.name}
                </strong>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                  {timeLabel(p.arrivedAt)}
                  {p.departedAt !== p.arrivedAt ? ` – ${timeLabel(p.departedAt)}` : ""}
                  {durationLabel(p.durationMs) ? ` · ${durationLabel(p.durationMs)}` : ""}
                </div>
                {p.stays > 1 && (
                  <div style={{ fontSize: 11.5, color: "#64748b" }}>Came back {p.stays} times</div>
                )}
                {p.logged.map((v) => (
                  <div key={v.id} style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{v.name}</div>
                    {v.description && (
                      <div
                        style={{ fontSize: 12, color: "#334155", whiteSpace: "pre-line" }}
                        dangerouslySetInnerHTML={{ __html: esc(v.description) }}
                      />
                    )}
                    {(v.contactName || v.contactPhone || v.contactEmail) && (
                      <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>
                        <span style={{ fontWeight: 600 }}>Contact:</span> {[v.contactName, v.contactPhone, v.contactEmail].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {v.remarks && (
                      <div style={{ fontSize: 12, color: "#334155", marginTop: 2, whiteSpace: "pre-line" }}>
                        <span style={{ fontWeight: 600 }}>Remarks:</span> {v.remarks}
                      </div>
                    )}
                    {v.hasPhoto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/admin/field-visits/${v.id}/photo`}
                        alt={v.name}
                        style={{ width: 150, height: 100, objectFit: "cover", marginTop: 6, borderRadius: 6 }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Popup>
          </Marker>
        ))}

        {end && (
          <Marker position={[end.latitude, end.longitude]} icon={endIcon} zIndexOffset={300}>
            <Popup>
              <strong>Last location</strong>
              <br />
              {timeLabel(end.timestamp)}
            </Popup>
          </Marker>
        )}
        {start && (
          <Marker position={[start.latitude, start.longitude]} icon={startIcon} zIndexOffset={1000}>
            <Popup>
              <strong>Starting point</strong>
              <br />
              First location at {timeLabel(start.timestamp)}
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Legend sits above the map's own panes (see .leaflet-container isolation). */}
      <div
        className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[11px] font-medium shadow-md ring-1 ring-black/5"
        style={{ background: "rgba(255,255,255,0.95)", color: "#475569" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Start
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-600" /> Logged stop
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> Detected stop
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-slate-900" /> Last seen
        </span>
      </div>
    </div>
  );
}
