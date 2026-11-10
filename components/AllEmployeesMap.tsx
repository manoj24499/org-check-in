"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, LayerGroup, LayersControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search } from "lucide-react";

export type MapEmployee = {
  id: string;
  name: string;
  employeeCode: string;
  workMode: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  outsideSince: string | null;
  location: { latitude: number; longitude: number; accuracy: number; timestamp: string } | null;
};

export type MapOffice = { latitude: number; longitude: number; radiusMeters: number; name: string } | null;

// Same window the Current status table uses to call a ping "live".
const LIVE_MS = 3 * 60 * 1000;

type Status = "live" | "stale" | "outside" | "off";

const STATUS_STYLE: Record<Status, { color: string; label: string }> = {
  live: { color: "#16a34a", label: "Live" },
  stale: { color: "#d97706", label: "Not sending" },
  outside: { color: "#dc2626", label: "Outside work area" },
  off: { color: "#64748b", label: "Not working" },
};

const MODE_LABEL: Record<string, string> = { OFFICE: "Office", WFH: "Work from home", FIELD: "Field", HYBRID: "Hybrid" };

function statusOf(e: MapEmployee, now: number): Status {
  const working = Boolean(e.checkInAt) && !e.checkOutAt;
  if (!working) return "off";
  if (e.outsideSince) return "outside";
  if (!e.location || now - new Date(e.location.timestamp).getTime() > LIVE_MS) return "stale";
  return "live";
}

function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min ago`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function pinIcon(name: string, status: Status, selected: boolean) {
  const { color } = STATUS_STYLE[status];
  const size = selected ? 44 : 36;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${status === "live" ? `<span class="vp-pulse" style="position:absolute;inset:-4px;border-radius:50%;background:${color}44"></span>` : ""}
      <div style="position:absolute;inset:0;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${selected ? 14 : 12}px system-ui">${initials(name).replace(/[<>&]/g, "")}</div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const officeIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:8px;background:#0f172a;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/** Frames everyone once when the first positions arrive; after that the admin's own pan/zoom is left alone. */
function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
  }, [points, map]);
  return null;
}

function FlyTo({ target }: { target: { lat: number; lng: number; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [target, map]);
  return null;
}

/**
 * Every employee on one map (the dashboard's "Live map" tab). Positions come from the dashboard's own 5-second
 * live feed, so pins move without a refresh. Pin colour is the status — green live, amber not sending, red outside
 * the work area, grey for people who aren't working (hidden unless switched on). Clicking a pin or a name in the
 * list shows a card with a button that opens that person's route.
 */
export default function AllEmployeesMap({
  employees,
  office,
  onOpenRoute,
}: {
  employees: MapEmployee[];
  office: MapOffice;
  onOpenRoute: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fly, setFly] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const markerRefs = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const located = useMemo(
    () => employees.filter((e) => e.location).map((e) => ({ e, status: statusOf(e, now) })),
    [employees, now],
  );
  const counts = useMemo(() => {
    const c: Record<Status, number> = { live: 0, stale: 0, outside: 0, off: 0 };
    located.forEach((x) => (c[x.status] += 1));
    return c;
  }, [located]);

  const q = query.trim().toLowerCase();
  const visible = located.filter(
    (x) =>
      (showOff || x.status !== "off") &&
      (!q || x.e.name.toLowerCase().includes(q) || x.e.employeeCode.toLowerCase().includes(q)),
  );
  // Most urgent first in the list: outside, not sending, live, then the rest.
  const order: Record<Status, number> = { outside: 0, stale: 1, live: 2, off: 3 };
  const listed = [...visible].sort((a, b) => order[a.status] - order[b.status] || a.e.name.localeCompare(b.e.name));

  const fitPoints = useMemo(
    () => located.filter((x) => x.status !== "off").map((x) => [x.e.location!.latitude, x.e.location!.longitude] as [number, number]),
    [located],
  );
  const noWorking = counts.live + counts.stale + counts.outside === 0;

  function pick(id: string) {
    const item = located.find((x) => x.e.id === id);
    if (!item?.e.location) return;
    setSelectedId(id);
    setFly({ lat: item.e.location.latitude, lng: item.e.location.longitude, n: Date.now() });
    markerRefs.current.get(id)?.openPopup();
  }

  return (
    <div className="grid h-[calc(100vh-250px)] min-h-[460px] grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Roster */}
      <aside className="flex min-h-0 flex-col rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="shrink-0 border-b border-black/5 p-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5 text-[11.5px] font-medium">
            {(["live", "stale", "outside"] as Status[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-black/5">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_STYLE[s].color }} />
                {counts[s]} {STATUS_STYLE[s].label.toLowerCase()}
              </span>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employee"
              className="w-full rounded-xl border border-black/10 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className="accent-orange-600" />
            Also show people who aren&apos;t working ({counts.off})
          </label>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {listed.map(({ e, status }) => {
            const active = e.id === selectedId;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => pick(e.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? "bg-orange-50 ring-1 ring-orange-200" : "hover:bg-slate-50"}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_STYLE[status].color }} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium text-slate-800">{e.name}</span>
                    <span className="block truncate text-[11.5px] text-slate-500">
                      {STATUS_STYLE[status].label} · {ago(e.location!.timestamp, now)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {listed.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">
              {noWorking && !showOff ? "Nobody is working with a known location right now." : "No match."}
            </li>
          )}
        </ul>
      </aside>

      {/* Map */}
      <div className="relative isolate min-h-0 overflow-hidden rounded-2xl border border-black/5 bg-white p-1.5 shadow-sm">
        <MapContainer
          center={office ? [office.latitude, office.longitude] : [20.5937, 78.9629]}
          zoom={office ? 15 : 5}
          scrollWheelZoom
          style={{ height: "100%", width: "100%", borderRadius: 12 }}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Street map">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite + names">
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
          </LayersControl>

          <FitOnce points={fitPoints} />
          <FlyTo target={fly} />

          {office && (
            <>
              <Circle
                center={[office.latitude, office.longitude]}
                radius={office.radiusMeters}
                pathOptions={{ color: "#0f172a", weight: 1.5, dashArray: "5 5", fillOpacity: 0.05 }}
              />
              <Marker position={[office.latitude, office.longitude]} icon={officeIcon} zIndexOffset={100}>
                <Popup>
                  <strong>{office.name || "Office"}</strong>
                  <br />
                  Work area · {Math.round(office.radiusMeters)} m
                </Popup>
              </Marker>
            </>
          )}

          {visible.map(({ e, status }) => (
            <Marker
              key={e.id}
              position={[e.location!.latitude, e.location!.longitude]}
              icon={pinIcon(e.name, status, e.id === selectedId)}
              zIndexOffset={status === "outside" ? 900 : status === "live" ? 600 : 300}
              ref={(m) => {
                if (m) markerRefs.current.set(e.id, m);
                else markerRefs.current.delete(e.id);
              }}
              eventHandlers={{ click: () => setSelectedId(e.id) }}
            >
              <Popup>
                <div style={{ minWidth: 170 }}>
                  <strong>{e.name}</strong> <span style={{ color: "#64748b" }}>· {e.employeeCode}</span>
                  <div style={{ margin: "4px 0", fontSize: 12 }}>
                    <span style={{ color: STATUS_STYLE[status].color, fontWeight: 600 }}>{STATUS_STYLE[status].label}</span>
                    {" · "}
                    {MODE_LABEL[e.workMode] ?? e.workMode}
                    <br />
                    Updated {ago(e.location!.timestamp, now)} · ±{Math.round(e.location!.accuracy)} m
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenRoute(e.id)}
                    style={{ marginTop: 2, width: "100%", border: "1px solid #ea580c", color: "#c2410c", background: "#fff7ed", borderRadius: 8, padding: "5px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    View today&apos;s route
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {noWorking && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] mx-auto w-fit rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-slate-600 shadow ring-1 ring-black/5">
            Nobody is working with a known location right now
          </div>
        )}
      </div>
    </div>
  );
}
