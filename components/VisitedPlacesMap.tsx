"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Same CDN marker-icon workaround as components/OfficeLocationMap.tsx —
// Leaflet's default icon paths break under Next.js's bundler.
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface VisitedPlacesPing {
  latitude: number;
  longitude: number;
}

export interface VisitedPlacesVisit {
  latitude: number;
  longitude: number;
  placeName: string | null;
  arrivedAt: string;
  departedAt: string;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function FitBounds({ path }: { path: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (path.length === 0) return;
    if (path.length === 1) {
      map.setView(path[0], 15);
      return;
    }
    map.fitBounds(path, { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return null;
}

export default function VisitedPlacesMap({
  pings,
  visits,
}: {
  pings: VisitedPlacesPing[];
  visits: VisitedPlacesVisit[];
}) {
  if (pings.length === 0) {
    return (
      <div className="h-[320px] w-full flex items-center justify-center bg-slate-100 text-sm text-secondary rounded-xl">
        No location data for this day.
      </div>
    );
  }

  const path: [number, number][] = pings.map((p) => [p.latitude, p.longitude]);

  return (
    <MapContainer center={path[0]} zoom={13} scrollWheelZoom style={{ height: "320px", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds path={path} />
      <Polyline positions={path} pathOptions={{ color: "#f06400", weight: 3 }} />
      {visits.map((v, i) => (
        <Marker key={i} position={[v.latitude, v.longitude]} icon={markerIcon}>
          <Popup>
            <strong>{v.placeName ?? "Unknown place"}</strong>
            <br />
            {timeLabel(v.arrivedAt)} – {timeLabel(v.departedAt)}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
