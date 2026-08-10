"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";

const OfficeLocationMap = dynamic(() => import("./OfficeLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[360px] w-full flex items-center justify-center bg-surface text-sm text-secondary">
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
      <div className="rounded-lg overflow-hidden border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] ">
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
        className="flex flex-col gap-4 rounded-lg bg-surface-2 border border-white/60 shadow-[0_1px_2px_rgba(41,43,49,0.05)] p-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-medium text-foreground">Office Location</h2>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-2">
            Office name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-muted-2">Latitude</label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(Number(e.target.value))}
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-2">
              Longitude
            </label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(Number(e.target.value))}
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-2">
            Allowed radius (meters)
          </label>
          <input
            type="number"
            min={1}
            step="1"
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            required
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
          />
          <p className="text-xs text-muted mt-1.5">Default is 50 meters.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 text-red-600 p-3 text-sm border border-red-100">
            {error}
          </div>
        )}
        {saved && (
          <div className="rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm border border-emerald-100">
            Office location saved.
          </div>
        )}

        <button
          disabled={loading}
          className="rounded-lg border border-primary bg-transparent text-primary-dark py-2.5 text-sm font-medium hover:bg-primary/5 transition disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save location"}
        </button>

        <p className="text-xs text-muted">
          Click anywhere on the map, or drag the marker, to set the office
          location.
        </p>
      </form>
    </div>
  );
}
