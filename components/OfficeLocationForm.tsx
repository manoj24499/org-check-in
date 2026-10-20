"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MapPin, Crosshair, Info } from "lucide-react";
import { BTN_PRIMARY, CARD, IconChip, SectionTitle } from "./admin/ui";

const OfficeLocationMap = dynamic(() => import("./OfficeLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] w-full flex items-center justify-center bg-slate-50 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

type OfficeLocation = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
} | null;

const DEFAULT_LATITUDE = 28.6139;
const DEFAULT_LONGITUDE = 77.209;
const DEFAULT_RADIUS_METERS = 50;

export default function OfficeLocationForm({
  officeLocation,
}: {
  officeLocation: OfficeLocation;
}) {
  const router = useRouter();
  const [name, setName] = useState(officeLocation?.name ?? "Main Office");
  const [latitude, setLatitude] = useState(
    officeLocation?.latitude ?? DEFAULT_LATITUDE,
  );
  const [longitude, setLongitude] = useState(
    officeLocation?.longitude ?? DEFAULT_LONGITUDE,
  );
  const [radiusMeters, setRadiusMeters] = useState(
    officeLocation?.radiusMeters ?? DEFAULT_RADIUS_METERS,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // No office configured yet — center the picker near the admin's own
  // location as a convenience starting point. Best-effort; silently ignored
  // if permission is denied or unavailable.
  useEffect(() => {
    if (officeLocation) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
      },
      () => {},
      { timeout: 5000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/admin/office-location", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, latitude, longitude, radiusMeters }),
    });
    const data = await res
      .json()
      .catch(() => ({ error: "Unexpected server response." }));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 border-b border-slate-100 pl-5">
          <IconChip icon={Crosshair} size="sm" />
          <div className="flex-1">
            <SectionTitle title="Pick on map" hint="Click anywhere, or drag the marker, to set the office location." />
          </div>
        </div>
        <OfficeLocationMap
          latitude={latitude}
          longitude={longitude}
          radiusMeters={radiusMeters}
          onChange={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className={`${CARD} flex flex-col gap-5 p-6`}
      >
        <div className="flex items-center gap-3">
          <IconChip icon={MapPin} />
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Office Location</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Where employees are allowed to check in.</p>
          </div>
        </div>

        <div>
          <label className="text-[13px] font-medium text-slate-600">
            Office name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[13px] font-medium text-slate-600">Latitude</label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(Number(e.target.value))}
              required
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            />
          </div>
          <div>
            <label className="text-[13px] font-medium text-slate-600">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(Number(e.target.value))}
              required
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-[13px] font-medium text-slate-600">
            Allowed radius (meters)
          </label>
          <input
            type="number"
            min={1}
            step="1"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            required
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-all"
          />
          <p className="mt-1.5 text-xs text-slate-500">Default is 50 meters.</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 text-red-600 p-3 text-sm border border-red-100">
            {error}
          </div>
        )}
        {saved && (
          <div className="rounded-xl bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-100">
            Office location saved.
          </div>
        )}

        <button
          disabled={loading}
          className={`${BTN_PRIMARY} w-full`}
        >
          {loading ? "Saving…" : "Save location"}
        </button>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p>
            Click anywhere on the map, or drag the marker, to set the office
            location.
          </p>
        </div>
      </form>
    </div>
  );
}
