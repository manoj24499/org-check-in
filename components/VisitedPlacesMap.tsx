"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  LayersControl,
  LayerGroup,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface VisitedPlacesPing {
  latitude: number;
  longitude: number;
  /** ISO time; used to find silences in the route. */
  timestamp?: string;
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

// Small chevron laid along the route to show which way the worker travelled.
function arrowIcon(bearing: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;transform:rotate(${bearing}deg);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 3 L19 20 L12 16 L5 20 Z" fill="#ffffff" stroke="#c2410c" stroke-width="2" stroke-linejoin="round"/></svg></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function kmIcon(label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="transform:translate(-50%,-50%);background:#0f172a;color:#fff;font:600 10.5px/1 system-ui,sans-serif;padding:3px 6px;border-radius:99px;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);white-space:nowrap">${label}</div>`,
    iconSize: [0, 0],
  });
}

function bearingDeg(a: [number, number], b: [number, number]) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}

interface NearbyPlace {
  id: string;
  name: string;
  kind: string;
  category: string;
  latitude: number;
  longitude: number;
}

const CATEGORY_COLOR: Record<string, string> = {
  food: "#d97706",
  education: "#2563eb",
  health: "#dc2626",
  shop: "#9333ea",
  stay: "#0d9488",
  worship: "#64748b",
  service: "#475569",
  other: "#16a34a",
};
const NEARBY_OVERLAY = "Nearby places";
const NEARBY_MIN_ZOOM = 15;
const NEARBY_LABEL_ZOOM = 17;

/**
 * Shops, restaurants, schools, colleges, hospitals and other named places from
 * OpenStreetMap around whatever part of the map is on screen. Loaded only once the
 * map is zoomed in, and can be switched off in the layer control.
 */
function NearbyPlaces() {
  const map = useMap();
  const [on, setOn] = useState(true);
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [bounds, setBounds] = useState(() => map.getBounds());
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const known = useRef(new Map<string, NearbyPlace>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const schedule = () => {
    if (map.getZoom() < NEARBY_MIN_ZOOM) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const b = map.getBounds();
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setStatus("loading");
      try {
        const qs = new URLSearchParams({
          south: String(b.getSouth()),
          west: String(b.getWest()),
          north: String(b.getNorth()),
          east: String(b.getEast()),
        });
        const res = await fetch(`/api/admin/places-nearby?${qs}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("unavailable");
        const body = (await res.json()) as { places: NearbyPlace[] };
        for (const p of body.places) known.current.set(p.id, p);
        // Keep memory in check on very long sessions.
        if (known.current.size > 3000) known.current = new Map([...known.current].slice(-1500));
        setPlaces([...known.current.values()]);
        setStatus("idle");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }, 600);
  };
  const load = () => {
    setZoom(map.getZoom());
    setBounds(map.getBounds());
    schedule();
  };

  useMapEvents({
    moveend: () => on && load(),
    overlayadd: (e) => {
      if (e.name === NEARBY_OVERLAY) {
        setOn(true);
        load();
      }
    },
    overlayremove: (e) => {
      if (e.name === NEARBY_OVERLAY) setOn(false);
    },
  });
  useEffect(() => {
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (zoom < NEARBY_MIN_ZOOM) return [];
    const padded = bounds.pad(0.1);
    return places.filter((p) => padded.contains([p.latitude, p.longitude])).slice(0, 400);
  }, [places, bounds, zoom]);
  // Names are always visible only when few enough are on screen to stay readable; otherwise hover.
  const showLabels = zoom >= NEARBY_LABEL_ZOOM && visible.length <= (zoom >= NEARBY_LABEL_ZOOM + 1 ? 140 : 70);

  return (
    <>
      {on && zoom < NEARBY_MIN_ZOOM && (
        <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 shadow">
          Zoom in to see shops, restaurants and schools
        </div>
      )}
      {on && zoom >= NEARBY_MIN_ZOOM && status === "error" && (
        <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] rounded-md bg-white/90 px-2.5 py-1 text-[11.5px] font-medium text-amber-800 shadow">
          Nearby places are unavailable right now
        </div>
      )}
      {visible.map((p) => (
        <CircleMarker
          // The tooltip's permanent flag is only read when it is created, so it is part of the key.
          key={`${p.id}-${showLabels}`}
          center={[p.latitude, p.longitude]}
          radius={5.5}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: CATEGORY_COLOR[p.category] ?? "#475569", fillOpacity: 0.95 }}
        >
          {showLabels ? (
            <Tooltip permanent direction="right" offset={[7, 0]} className="vp-label">
              {p.name}
            </Tooltip>
          ) : (
            <Tooltip direction="top" offset={[0, -4]} className="vp-hover">
              {p.name}
            </Tooltip>
          )}
          <Popup>
            <strong>{p.name}</strong>
            <br />
            {p.kind}
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

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
  // Split the route wherever the phone went silent for more than GAP_MS: the real
  // path is drawn solid, and the unmeasured stretch between is drawn dashed.
  const { segments, gapLines } = useMemo(() => {
    const GAP_MS = 5 * 60 * 1000;
    const segs: [number, number][][] = [];
    const gaps: { a: [number, number]; b: [number, number]; minutes: number; from: string; to: string }[] = [];
    let cur: [number, number][] = [];
    pings.forEach((p, i) => {
      const pt: [number, number] = [p.latitude, p.longitude];
      const prev = pings[i - 1];
      if (prev && p.timestamp && prev.timestamp) {
        const ms = new Date(p.timestamp).getTime() - new Date(prev.timestamp).getTime();
        if (ms > GAP_MS) {
          segs.push(cur);
          gaps.push({
            a: [prev.latitude, prev.longitude],
            b: pt,
            minutes: Math.round(ms / 60000),
            from: prev.timestamp,
            to: p.timestamp,
          });
          cur = [];
        }
      }
      cur.push(pt);
    });
    if (cur.length) segs.push(cur);
    return { segments: segs, gapLines: gaps };
  }, [pings]);
  const bounds = useMemo<[number, number][]>(
    () => [...path, ...places.map((p) => [p.latitude, p.longitude] as [number, number])],
    [path, places],
  );

  const [zoom, setZoom] = useState(13);
  const [hover, setHover] = useState<number | null>(null);

  // The route as a list of points with the time and the distance covered so far
  // (stretches where the phone was silent add nothing). Drives the direction
  // arrows, the km markers and the hover read-out.
  const trail = useMemo(() => {
    const GAP_MS = 5 * 60 * 1000;
    const out: { pt: [number, number]; ts: string | null; km: number; contiguous: boolean }[] = [];
    let km = 0;
    pings.forEach((p, i) => {
      const pt: [number, number] = [p.latitude, p.longitude];
      let contiguous = i > 0;
      if (i > 0) {
        const prev = pings[i - 1];
        const gap = p.timestamp && prev.timestamp ? new Date(p.timestamp).getTime() - new Date(prev.timestamp).getTime() : 0;
        if (gap > GAP_MS) contiguous = false;
        else km += L.latLng(prev.latitude, prev.longitude).distanceTo(L.latLng(pt[0], pt[1])) / 1000;
      }
      out.push({ pt, ts: p.timestamp ?? null, km, contiguous });
    });
    return out;
  }, [pings]);

  const { arrows, kmMarks } = useMemo(() => {
    const total = trail.length ? trail[trail.length - 1].km : 0;
    const arr: { pt: [number, number]; bearing: number }[] = [];
    const marks: { pt: [number, number]; label: string }[] = [];
    if (total < 0.3) return { arrows: arr, kmMarks: marks };
    const step = Math.min(3, Math.max(0.35, total / 40));
    const kmStep = total >= 15 ? 10 : total >= 6 ? 5 : 0;
    let nextArrow = step;
    let nextKm = kmStep;
    trail.forEach((t, i) => {
      if (!t.contiguous) return;
      if (t.km >= nextArrow) {
        const a = trail[Math.max(0, i - 3)].pt;
        const b = trail[Math.min(trail.length - 1, i + 3)].pt;
        if (a[0] !== b[0] || a[1] !== b[1]) arr.push({ pt: t.pt, bearing: bearingDeg(a, b) });
        nextArrow = t.km + step;
      }
      if (kmStep && t.km >= nextKm) {
        marks.push({ pt: t.pt, label: `${Math.round(nextKm)} km` });
        nextKm += kmStep;
      }
    });
    return { arrows: arr, kmMarks: marks };
  }, [trail]);

  const nearest = (lat: number, lng: number) => {
    let best = -1;
    let bestD = Infinity;
    trail.forEach((t, i) => {
      const d = (t.pt[0] - lat) ** 2 + (t.pt[1] - lng) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  if (bounds.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        No location data for this day.
      </div>
    );
  }

  return (
    <div className="relative isolate h-full w-full">
      <MapContainer center={bounds[0]} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Street map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite + names">
            {/* One base layer made of imagery plus a place-names overlay. */}
            <LayerGroup>
              <TileLayer
                attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={18}
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxNativeZoom={18}
                maxZoom={19}
              />
            </LayerGroup>
          </LayersControl.BaseLayer>
          <LayersControl.Overlay checked name={NEARBY_OVERLAY}>
            <LayerGroup>
              <NearbyPlaces />
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>
        <ScaleControl position="bottomright" imperial={false} />
        <ZoomWatcher onZoom={setZoom} />
        <FitBounds points={bounds} />
        <Focus order={focusOrder} places={places} markers={markers} />

        {/* White casing under the route keeps it readable on busy map tiles. */}
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <Fragment key={i}>
              <Polyline positions={seg} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
              <Polyline positions={seg} pathOptions={{ color: "#ea580c", weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
            </Fragment>
          ) : null,
        )}

        {/* Silences: the line is a guess, so it is dashed grey and labelled. */}
        {gapLines.map((g, i) => (
          <Polyline
            key={`gap-${i}`}
            positions={[g.a, g.b]}
            pathOptions={{ color: "#64748b", weight: 3, opacity: 0.9, dashArray: "3 9", lineCap: "round" }}
          >
            <Tooltip sticky>
              No location data · {g.minutes >= 60 ? `${Math.floor(g.minutes / 60)} h ${g.minutes % 60} min` : `${g.minutes} min`}
              <br />
              {timeLabel(g.from)} – {timeLabel(g.to)}
            </Tooltip>
          </Polyline>
        ))}

        {/* Direction arrows and distance markers along the route */}
        {arrows.map((a, i) => (
          <Marker key={`arrow-${i}`} position={a.pt} icon={arrowIcon(a.bearing)} interactive={false} zIndexOffset={100} />
        ))}
        {kmMarks.map((m, i) => (
          <Marker key={`km-${i}`} position={m.pt} icon={kmIcon(m.label)} interactive={false} zIndexOffset={150} />
        ))}

        {/* Hover anywhere on the route to read the time and distance at that point */}
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <Polyline
              key={`hit-${i}`}
              positions={seg}
              pathOptions={{ color: "#000000", weight: 22, opacity: 0 }}
              eventHandlers={{
                mousemove: (e) => setHover(nearest(e.latlng.lat, e.latlng.lng)),
                mouseout: () => setHover(null),
              }}
            />
          ) : null,
        )}
        {hover !== null && trail[hover] && (
          <CircleMarker
            center={trail[hover].pt}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#ea580c", fillOpacity: 1 }}
            interactive={false}
          >
            <Tooltip permanent direction="top" offset={[0, -8]} className="vp-hover">
              {trail[hover].ts ? timeLabel(trail[hover].ts as string) : "Route"} · {trail[hover].km.toFixed(1)} km from start
            </Tooltip>
          </CircleMarker>
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
            {zoom >= 14 && (
              <Tooltip permanent direction="right" offset={[14, 0]} className="vp-label">
                {p.name}
              </Tooltip>
            )}
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
        className="pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-110px)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[11px] font-medium shadow-md ring-1 ring-black/5"
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
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-[3px] border-dotted" style={{ borderColor: "#64748b" }} /> No data
        </span>
      </div>
    </div>
  );
}
