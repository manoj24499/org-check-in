"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Link2, Loader2, MapPin, Search, Trash2, TriangleAlert } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "./admin/ui";
import type { MapSearchResult } from "./AssignPlacesMap";
import type { NearbyPlace } from "./VisitedPlacesMap";

const AssignPlacesMap = dynamic(() => import("./AssignPlacesMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Loading map…</div>,
});

const MAX_PLACES = 40;
const INPUT =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

interface Draft {
  key: string;
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  status: "PENDING" | "VISITED" | "SKIPPED";
  visitedAt: string | null;
  skipReason: string | null;
}

interface ServerPlace {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: "PENDING" | "VISITED" | "SKIPPED";
  skipReason: string | null;
  visitedAt: string | null;
}

let keyCounter = 0;
const newKey = () => `d${++keyCounter}`;

function fromServer(p: ServerPlace): Draft {
  return {
    key: p.id,
    id: p.id,
    name: p.name,
    address: p.address ?? "",
    latitude: p.latitude,
    longitude: p.longitude,
    description: p.description ?? "",
    contactName: p.contactName ?? "",
    contactPhone: p.contactPhone ?? "",
    notes: p.notes ?? "",
    status: p.status,
    visitedAt: p.visitedAt,
    skipReason: p.skipReason,
  };
}

function todayKey() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Admin screen for assigning places to one field worker for a day. Places are added by searching,
 * clicking the map, tapping a nearby shop or school, or pasting a Google Maps link or coordinates.
 * Saving puts them in a nearest-first order (from the office); the worker's app re-plans from where
 * they actually are.
 */
export default function AssignPlacesPanel({ userId, employeeName }: { userId: string; employeeName: string }) {
  const [date, setDate] = useState(todayKey());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focus, setFocus] = useState<{ latitude: number; longitude: number; nonce: number } | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [office, setOffice] = useState<{ latitude: number; longitude: number } | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const loading = loadedFor !== date;

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/employees/${userId}/assigned-places?date=${date}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Could not load the places.");
        return body as { places: ServerPlace[] };
      })
      .then((body) => {
        if (!alive) return;
        setDrafts(body.places.map(fromServer));
        setDirty(false);
        setError(null);
        setFitNonce((n) => n + 1);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not load the places.");
      })
      .finally(() => {
        if (alive) setLoadedFor(date);
      });
    return () => {
      alive = false;
    };
  }, [userId, date]);

  useEffect(() => {
    fetch("/api/admin/office-location")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const o = b?.officeLocation;
        if (o && typeof o.latitude === "number" && typeof o.longitude === "number") setOffice({ latitude: o.latitude, longitude: o.longitude });
      })
      .catch(() => {});
  }, []);

  // Search as the admin types (after a short pause).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/places-search?q=${encodeURIComponent(q)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Search failed.");
        setResults(body.results ?? []);
        setError(null);
      } catch (err) {
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed.");
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [query]);

  const editable = drafts.filter((d) => d.status !== "VISITED");
  // Results only count while the box still holds a real query.
  const shownResults = query.trim().length >= 3 ? results : [];

  function addPlace(p: { name: string; address?: string; latitude: number; longitude: number; description?: string }) {
    setNotice(null);
    if (drafts.length >= MAX_PLACES) {
      setError(`At most ${MAX_PLACES} places can be assigned for one day.`);
      return;
    }
    // The same spot twice is almost certainly a mistake (about 15 m).
    const dup = drafts.find((d) => Math.abs(d.latitude - p.latitude) < 0.00014 && Math.abs(d.longitude - p.longitude) < 0.00014);
    if (dup) {
      setError(`"${dup.name || "A place"}" is already at that spot.`);
      setFocus({ latitude: dup.latitude, longitude: dup.longitude, nonce: Date.now() });
      return;
    }
    setError(null);
    const key = newKey();
    setLastAdded(key);
    setDrafts((prev) => [
      ...prev,
      {
        key,
        name: p.name,
        address: p.address ?? "",
        latitude: Math.round(p.latitude * 1e6) / 1e6,
        longitude: Math.round(p.longitude * 1e6) / 1e6,
        description: p.description ?? "",
        contactName: "",
        contactPhone: "",
        notes: "",
        status: "PENDING",
        visitedAt: null,
        skipReason: null,
      },
    ]);
    setDirty(true);
    setPin(null);
    setFocus({ latitude: p.latitude, longitude: p.longitude, nonce: Date.now() });
  }

  function update(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    setDirty(true);
    setNotice(null);
  }

  function remove(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setDirty(true);
    setNotice(null);
  }

  async function addFromPaste() {
    const text = pasteText.trim();
    if (!text) return;
    setPasting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/places-parse-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not read that.");
      if (typeof body.latitude === "number" && typeof body.longitude === "number") {
        addPlace({ name: body.name ?? "", latitude: body.latitude, longitude: body.longitude });
        setPasteText("");
      } else if (body.name) {
        // The link names a place but has no position: let the admin pick it from a search.
        setQuery(body.name);
        setNotice(`That link only names "${body.name}". Pick the right match from the search results.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that.");
    } finally {
      setPasting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const missing = editable.find((d) => !d.name.trim());
    if (missing) {
      setSaving(false);
      setError("Give every place a name before saving.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/employees/${userId}/assigned-places?date=${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places: editable.map((d) => ({
            id: d.id,
            name: d.name.trim(),
            address: d.address.trim() || undefined,
            latitude: d.latitude,
            longitude: d.longitude,
            description: d.description.trim() || undefined,
            contactName: d.contactName.trim() || undefined,
            contactPhone: d.contactPhone.trim() || undefined,
            notes: d.notes.trim() || undefined,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      setDrafts((body.places as ServerPlace[]).map(fromServer));
      setDirty(false);
      setNotice(
        body.roadDistances
          ? `Saved. ${employeeName} will see these places nearest first, planned by road distance.`
          : `Saved. ${employeeName} will see these places nearest first (straight-line distance, road routing is not connected yet).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const mapPlaces = drafts.map((d, i) => ({ key: d.key, latitude: d.latitude, longitude: d.longitude, name: d.name, order: i + 1, status: d.status }));
  const visitedCount = drafts.filter((d) => d.status === "VISITED").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Date and save */}
      <div className={`${CARD} flex flex-wrap items-end justify-between gap-3 p-4`}>
        <div>
          <p className="text-[15px] font-semibold text-slate-900">Assign places to {employeeName}</p>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Their app puts these in the nearest-first order and guides them from stop to stop.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] font-medium text-slate-600">
            For date
            <input
              type="date"
              min={todayKey()}
              value={date}
              onChange={(e) => {
                if (dirty && !window.confirm("You have unsaved changes. Switch date and discard them?")) return;
                setDate(e.target.value || todayKey());
              }}
              className={`${INPUT} mt-1 w-auto`}
            />
          </label>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving || loading || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save places
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800">{notice}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Map and ways to add */}
        <div className={`${CARD} flex flex-col gap-3 p-3`}>
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a shop, school or address" className={`${INPUT} pl-9`} />
              {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFromPaste()}
                  placeholder="Paste a Google Maps link or coordinates"
                  className={`${INPUT} pl-9`}
                />
              </div>
              <button type="button" className={BTN_SECONDARY} onClick={addFromPaste} disabled={pasting || !pasteText.trim()}>
                {pasting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>

          {shownResults.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-xl border border-black/10 bg-white text-[13px]">
              {shownResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      addPlace({ name: r.name, address: r.label, latitude: r.latitude, longitude: r.longitude });
                      setResults([]);
                      setQuery("");
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-orange-50"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{r.name}</span>
                      <span className="block truncate text-[12px] text-slate-500">{r.label}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[12px] text-slate-500">
            You can also click anywhere on the map and choose &quot;Assign a place here&quot;, or zoom in and tap a shop, school or
            restaurant on the map.
          </p>
          {pin && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
              Pin at {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
              <button type="button" className={BTN_PRIMARY} onClick={() => addPlace({ name: "", latitude: pin.latitude, longitude: pin.longitude })}>
                Assign a place here
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setPin(null)}>
                Cancel
              </button>
            </div>
          )}

          <div className="h-[420px] overflow-hidden rounded-xl">
            <AssignPlacesMap
              places={mapPlaces}
              results={shownResults}
              pin={pin}
              office={office}
              focus={focus}
              fitNonce={fitNonce}
              onMapClick={(latitude, longitude) => setPin({ latitude, longitude })}
              onAddPin={() => pin && addPlace({ name: "", latitude: pin.latitude, longitude: pin.longitude })}
              onAddResult={(r) => {
                addPlace({ name: r.name, address: r.label, latitude: r.latitude, longitude: r.longitude });
                setResults([]);
              }}
              onAddNearby={(p: NearbyPlace) => addPlace({ name: p.name, description: p.kind, latitude: p.latitude, longitude: p.longitude })}
            />
          </div>
        </div>

        {/* The list */}
        <div className={`${CARD} flex flex-col p-4`}>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold text-slate-900">Places for {date === todayKey() ? "today" : date}</p>
            <span className="text-[12px] text-slate-500">
              {drafts.length} {drafts.length === 1 ? "place" : "places"}
              {visitedCount > 0 ? ` · ${visitedCount} visited` : ""}
            </span>
          </div>
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
          ) : drafts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No places yet. Search, paste a link or click the map to add one.</p>
          ) : (
            <ol className="flex max-h-[560px] flex-col gap-3 overflow-y-auto pr-1">
              {drafts.map((d, i) => {
                const locked = d.status === "VISITED";
                return (
                  <li key={d.key} className={`rounded-xl border p-3 ${locked ? "border-emerald-200 bg-emerald-50/50" : "border-black/10 bg-white"}`}>
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ${
                          locked ? "bg-emerald-600" : d.status === "SKIPPED" ? "bg-slate-400" : "bg-orange-600"
                        }`}
                      >
                        {locked ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <input
                          value={d.name}
                          onChange={(e) => update(d.key, { name: e.target.value })}
                          disabled={locked}
                          autoFocus={lastAdded === d.key && !d.name}
                          placeholder="Place name"
                          className={`${INPUT} font-medium`}
                        />
                        {d.address && <p className="mt-1 truncate text-[11.5px] text-slate-500">{d.address}</p>}
                      </div>
                      {!locked && (
                        <button type="button" onClick={() => remove(d.key)} className="mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove place">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {locked ? (
                      <p className="mt-2 text-[12px] text-emerald-800">Visited{d.visitedAt ? ` at ${timeOf(d.visitedAt)}` : ""}. This place can no longer be edited.</p>
                    ) : (
                      <div className="mt-2 grid gap-2">
                        {d.status === "SKIPPED" && (
                          <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-700">
                            Skipped by the employee: {d.skipReason}. Saving this list puts it back to pending.
                          </p>
                        )}
                        <input value={d.description} onChange={(e) => update(d.key, { description: e.target.value })} placeholder="Description (optional)" className={INPUT} />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={d.contactName} onChange={(e) => update(d.key, { contactName: e.target.value })} placeholder="Contact person" className={INPUT} />
                          <input value={d.contactPhone} onChange={(e) => update(d.key, { contactPhone: e.target.value })} placeholder="Phone" className={INPUT} />
                        </div>
                        <input value={d.notes} onChange={(e) => update(d.key, { notes: e.target.value })} placeholder="Instructions for the employee (optional)" className={INPUT} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-3 text-[12px] text-slate-500">The visiting order is set when you save: nearest first, starting from the office.</p>
        </div>
      </div>
    </div>
  );
}
