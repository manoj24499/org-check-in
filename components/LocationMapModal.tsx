"use client";

import dynamic from "next/dynamic";
import { X, MapPin } from "lucide-react";

const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[320px] w-full flex items-center justify-center bg-surface text-sm text-secondary">
      Loading map…
    </div>
  ),
});

export default function LocationMapModal({
  employeeName,
  latitude,
  longitude,
  accuracy,
  timestamp,
  onClose,
}: {
  employeeName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-foreground">{employeeName}</p>
              <p className="text-xs text-secondary">
                Updated{" "}
                {new Date(timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-muted-2 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <LocationMap
          latitude={latitude}
          longitude={longitude}
          accuracy={accuracy}
          label={employeeName}
        />

        <div className="px-6 py-3 bg-surface text-xs text-secondary flex items-center justify-between">
          <span>
            Lat {latitude.toFixed(5)}, Lng {longitude.toFixed(5)}
          </span>
          <span>±{Math.round(accuracy)}m accuracy</span>
        </div>
      </div>
    </div>
  );
}
