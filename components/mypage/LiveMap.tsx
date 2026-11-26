"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Office = { latitude: number; longitude: number; radiusMeters: number };
type Fix = { latitude: number; longitude: number; accuracy: number };

// Plain HTML markers: Leaflet's default marker images break under the bundler.
const meIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<span style="display:block;width:22px;height:22px;border-radius:50%;background:#ef6c00;border:3px solid #fff;box-shadow:0 0 0 6px rgba(239,108,0,.25),0 2px 6px rgba(0,0,0,.35)"></span>',
});
const officeIcon = L.divIcon({
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  html: '<span style="display:block;width:20px;height:20px;border-radius:5px;background:#1a1512;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>',
});

/** Follows the person until they drag the map themselves, and redraws when the card's size changes (it flips). */
function Follow({ fix, active }: { fix: Fix | null; active: boolean }) {
  const map = useMap();
  const first = useRef(true);
  const dragged = useRef(false);
  useEffect(() => {
    const onDrag = () => {
      dragged.current = true;
    };
    map.on("dragstart", onDrag);
    return () => {
      map.off("dragstart", onDrag);
    };
  }, [map]);
  useEffect(() => {
    if (active) setTimeout(() => map.invalidateSize(), 50);
  }, [active, map]);
  useEffect(() => {
    if (!fix) return;
    if (first.current) {
      first.current = false;
      map.setView([fix.latitude, fix.longitude], 17, { animate: false });
    } else if (!dragged.current) {
      map.panTo([fix.latitude, fix.longitude], { animate: true });
    }
  }, [fix, map]);
  return null;
}

/**
 * The live map on the My Page "today" card: the person's own position (kept up to date while the map is showing),
 * the accuracy of the reading, and, when it applies, the office and its allowed area.
 */
export default function LiveMap({ office, active }: { office: Office | null; active: boolean }) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Watching the position only while the map is on screen: a phone shouldn't keep the GPS warm for a hidden face.
  useEffect(() => {
    if (!active || !navigator.geolocation) {
      if (active) setTimeout(() => setProblem("This browser can't share your location."), 0);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setProblem(null);
        setFix({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (err) => {
        setProblem(
          err.code === 1
            ? "Allow location for this site to see where you are."
            : "Can't find your location yet. Turn on location services.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);

  const center: [number, number] = fix ? [fix.latitude, fix.longitude] : office ? [office.latitude, office.longitude] : [20.5937, 78.9629];

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapContainer center={center} zoom={fix || office ? 16 : 4} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Follow fix={fix} active={active} />
        {office && (
          <>
            <Circle
              center={[office.latitude, office.longitude]}
              radius={office.radiusMeters}
              pathOptions={{ color: "#ef6c00", weight: 1.5, dashArray: "5 5", fillOpacity: 0.07 }}
            />
            <Marker position={[office.latitude, office.longitude]} icon={officeIcon} />
          </>
        )}
        {fix && (
          <>
            <Circle center={[fix.latitude, fix.longitude]} radius={fix.accuracy} pathOptions={{ color: "#ef6c00", weight: 1, fillOpacity: 0.1 }} />
            <Marker position={[fix.latitude, fix.longitude]} icon={meIcon} />
          </>
        )}
      </MapContainer>
      <span
        style={{
          position: "absolute", left: 10, bottom: 22, zIndex: 1000, padding: "3px 10px", borderRadius: 999, fontSize: 12,
          background: "rgba(255,255,255,0.92)", border: "1px solid rgba(26,21,18,0.12)", color: problem ? "#b3453f" : "#1a1512",
        }}
      >
        {problem ?? (fix ? `Live location · accurate to ${Math.round(fix.accuracy)} m` : "Finding your location…")}
      </span>
    </div>
  );
}
