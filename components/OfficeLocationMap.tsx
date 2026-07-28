"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L, { type LeafletMouseEvent, type Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon paths break under bundlers (Next.js/webpack
// resolves them against the wrong base URL) — point them at a CDN instead.
const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Keeps the view centered on the marker after a manual lat/lng edit or a
// drag — without this the map's center is frozen at its initial mount value.
function RecenterOnChange({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);
  return null;
}

export default function OfficeLocationMap({
  latitude,
  longitude,
  radiusMeters,
  onChange,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  onChange: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={17}
      scrollWheelZoom
      style={{ height: "360px", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickToPlace onPick={onChange} />
      <RecenterOnChange latitude={latitude} longitude={longitude} />
      <Marker
        position={[latitude, longitude]}
        icon={markerIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = (e.target as LeafletMarker).getLatLng();
            onChange(pos.lat, pos.lng);
          },
        }}
      />
      <Circle
        center={[latitude, longitude]}
        radius={radiusMeters}
        pathOptions={{ color: "#f06400", fillOpacity: 0.15 }}
      />
    </MapContainer>
  );
}
