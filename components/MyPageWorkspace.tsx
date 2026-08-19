"use client";

import { useState } from "react";
import AttendanceCalendar, { type CalendarSpecialDay } from "./AttendanceCalendar";
import { RecentActivityList } from "./RecentActivityList";

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

export default function MyPageWorkspace({
  records,
  specialDays,
}: {
  records: AttendanceRecord[];
  specialDays?: Record<string, CalendarSpecialDay>;
}) {
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
        {tab === "activity" && <RecentActivityList records={records} />}
        {tab === "calendar" && (
          <AttendanceCalendar attendances={records} specialDays={specialDays} layout="split" />
        )}
      </div>
    </div>
  );
}
