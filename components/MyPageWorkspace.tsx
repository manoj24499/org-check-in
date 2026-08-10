"use client";

import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import AttendanceCalendar from "./AttendanceCalendar";

type AttendanceRecord = {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
  pauses?: { pausedAt: string; resumedAt: string | null }[];
};

const TABS = [
  { key: "activity", label: "Recent activity" },
  { key: "calendar", label: "Calendar" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// Full history feeds the Calendar tab (for month browsing); the Recent
// Activity list only ever shows the newest slice of it.
const RECENT_ACTIVITY_LIMIT = 50;

export default function MyPageWorkspace({ records }: { records: AttendanceRecord[] }) {
  const [tab, setTab] = useState<TabKey>("activity");

  return (
    <div className="rounded-lg border border-border bg-surface-2 shadow-[0_1px_2px_rgba(41,43,49,0.05)] overflow-hidden">
      <div className="flex gap-5 px-4 py-3 border-b border-border-soft">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
              tab === key ? "font-medium text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`w-3.5 h-[2px] block ${tab === key ? "bg-primary" : "bg-transparent"}`} />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "activity" && <ActivityPanel records={records.slice(0, RECENT_ACTIVITY_LIMIT)} />}
        {tab === "calendar" && <AttendanceCalendar attendances={records} layout="split" />}
      </div>
    </div>
  );
}

function ActivityPanel({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return (
      <p className="text-sm text-secondary text-center py-10">
        No records yet. Use the kiosk to check in.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {records.map((r, i) => (
        <div
          key={r.id}
          className={`flex items-center gap-3.5 py-2.5 ${i !== records.length - 1 ? "border-b border-border-soft" : ""}`}
        >
          {r.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/attendance/${r.id}/photo`}
              alt="Check-in photo"
              className="w-8 h-8 rounded-lg object-cover border border-border shrink-0"
            />
          ) : (
            <span className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0 text-muted">
              {r.type === "CHECK_IN" ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {r.type === "CHECK_IN" ? "Check in" : "Check out"}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {new Date(r.timestamp).toLocaleDateString("en-US", {
                day: "numeric",
                month: "short",
              })}{" "}
              · {r.method}
            </p>
          </div>
          <span
            className={`text-sm tabular-nums shrink-0 ${
              r.type === "CHECK_IN" ? "text-primary-dark" : "text-muted-2"
            }`}
          >
            {new Date(r.timestamp).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
