"use client";

import { useEffect, useMemo } from "react";
import { LayersControl, MapContainer, Marker, Popup, ScaleControl, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { NearbyPlaces, type NearbyPlace } from "./VisitedPlacesMap";

export interface MapPlace {
  key: string;
  latitude: number;
  longitude: number;
  name: string;
  order: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
}

export interface MapSearchResult {
  label: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  places: MapPlace[];
  results: MapSearchResult[];
  pin: { latitude: number; longitude: number } | null;
  office: { latitude: number; longitude: number } | null;
  focus: { latitude: number; longitude: number; nonce: number } | null;
  /** Bumped by the panel when a list is loaded, so the map fits all of its places once. */
  fitNonce: number;
  onMapClick: (latitude: number, longitude: number) => void;
  onAddPin: () => void;
  onAddResult: (result: MapSearchResult) => void;
  onAddNearby: (place: NearbyPlace) => void;
}

function numberIcon(order: number, status: MapPlace["status"]) {
  const bg = status === "VISITED" ? "#16a34a" : status === "SKIPPED" ? "#94a3b8" : "#ea580c";
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${bg};color:#fff;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font:600 11.5px/1 system-ui,sans-serif">${status === "VISITED" ? "&#10003;" : order}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const dotIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.5)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

function officeIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="padding:2px 7px;border-radius:6px;background:#0f172a;color:#fff;font:600 11px/1.3 system-ui,sans-serif;white-space:nowrap;transform:translate(-50%,-50%);border:1.5px solid #fff">Office</div>`,
    iconSize: [0, 0],
  });
}

function ClickCatcher({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Moves the map to the newest place, and fits every place when a list has just been loaded. */
function Mover({ places, focus, fitNonce }: { places: MapPlace[]; focus: Props["focus"]; fitNonce: number }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), 16), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  useEffect(() => {
    if (places.length === 0) return;
    map.fitBounds(L.latLngBounds(places.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [50, 50], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);
  return null;
}

export default function AssignPlacesMap({ places, results, pin, office, focus, fitNonce, onMapClick, onAddPin, onAddResult, onAddNearby }: Props) {
  const center = useMemo<[number, number]>(
    () => (office ? [office.latitude, office.longitude] : places[0] ? [places[0].latitude, places[0].longitude] : [11.0168, 76.9558]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={18} maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Nearby places">
          <NearbyPlaces onPick={onAddNearby} />
        </LayersControl.Overlay>
      </LayersControl>
      <ScaleControl position="bottomright" imperial={false} />
      <ClickCatcher onClick={onMapClick} />
      <Mover places={places} focus={focus} fitNonce={fitNonce} />

      {office && <Marker position={[office.latitude, office.longitude]} icon={officeIcon()} interactive={false} />}

      {places.map((p) => (
        <Marker key={p.key} position={[p.latitude, p.longitude]} icon={numberIcon(p.order, p.status)} zIndexOffset={200}>
          <Popup>
            <strong>{p.name || "Unnamed place"}</strong>
          </Popup>
        </Marker>
      ))}

      {results.map((r, i) => (
        <Marker key={`r-${i}`} position={[r.latitude, r.longitude]} icon={dotIcon("#2563eb")} zIndexOffset={100}>
          <Popup>
            <strong>{r.name}</strong>
            <br />
            <span style={{ fontSize: 12 }}>{r.label}</span>
            <br />
            <button type="button" onClick={() => onAddResult(r)} style={{ marginTop: 6, padding: "3px 10px", borderRadius: 8, background: "#ea580c", color: "#fff", fontWeight: 600, fontSize: 12 }}>
              Assign this place
            </button>
          </Popup>
        </Marker>
      ))}

      {pin && (
        <Marker position={[pin.latitude, pin.longitude]} icon={dotIcon("#0f172a")} zIndexOffset={300}>
          <Popup autoClose={false} closeOnClick={false}>
            <button type="button" onClick={onAddPin} style={{ padding: "3px 10px", borderRadius: 8, background: "#ea580c", color: "#fff", fontWeight: 600, fontSize: 12 }}>
              Assign a place here
            </button>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
