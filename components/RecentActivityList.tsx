import { LogIn, LogOut } from "lucide-react";
import { startOfISTDay } from "@/lib/istTime";

export interface RecentActivityRecord {
  id: string;
  type: "CHECK_IN" | "CHECK_OUT";
  method: string;
  timestamp: string;
  hasPhoto: boolean;
}

// A quick-glance widget, not the full history browser (that's the Calendar
// tab/section, which keeps showing everything for month-by-month review) —
// deliberately a short, fixed window rather than a record count, so it means
// the same thing regardless of how often someone checks in/out.
const RECENT_ACTIVITY_DAYS = 3;

/**
 * Shared between the employee's own "Recent activity" tab (my-page) and the
 * admin's employee detail page, so both stay in sync on what "recent" means
 * instead of drifting apart with separately-maintained copies.
 */
export function RecentActivityList({ records }: { records: RecentActivityRecord[] }) {
  // This is a Server Component — rendered on whatever clock the Node process
  // itself runs on (UTC in production, IST on most dev machines; see
  // lib/istTime.ts's doc comment for why that split makes this invisible in
  // local testing). `setHours`/`getDate()` and `toLocale*` without an
  // explicit `timeZone` are all server-clock-dependent, so both the cutoff
  // and the displayed date/time must be pinned to IST explicitly.
  const cutoff = new Date(
    startOfISTDay().getTime() - (RECENT_ACTIVITY_DAYS - 1) * 24 * 60 * 60 * 1000,
  );
  const recent = records.filter((r) => new Date(r.timestamp) >= cutoff);

  if (recent.length === 0) {
    return (
      <p className="text-sm text-secondary text-center py-10">
        No check-ins or check-outs in the last {RECENT_ACTIVITY_DAYS} days.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {recent.map((r, i) => (
        <div
          key={r.id}
          className={`flex items-center gap-3.5 py-2.5 ${i !== recent.length - 1 ? "border-b border-border-soft" : ""}`}
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
                timeZone: "Asia/Kolkata",
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
              timeZone: "Asia/Kolkata",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
