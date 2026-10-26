import Link from "next/link";
import { Clock, TriangleAlert } from "lucide-react";
import { TRIAL_EMPLOYEE_LIMIT, TRIAL_REMINDER_DAYS } from "@/lib/trial";

/**
 * Free-trial notice across the top of every admin page: the days left (fixed number, not a guess), the
 * employee limit, and a way to choose a plan. Turns red-and-urgent for the last TRIAL_REMINDER_DAYS days.
 * Stateless, so it renders in the server layout.
 */
export default function TrialBanner({ daysLeft, endsAt }: { daysLeft: number; endsAt: Date }) {
  const urgent = daysLeft <= TRIAL_REMINDER_DAYS;
  const when = endsAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const Icon = urgent ? TriangleAlert : Clock;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-2.5 text-[13px] ${
        urgent ? "border-red-200 bg-red-50 text-red-800" : "border-orange-200 bg-orange-50 text-orange-900"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-semibold">
        Free trial: {days} left{urgent ? " \u2014 ends " + when : ""}
      </span>
      <span className="opacity-80">
        {urgent
          ? "Choose a plan now or the account will be paused when it ends."
          : `Up to ${TRIAL_EMPLOYEE_LIMIT} employees during the trial (ends ${when}).`}
      </span>
      <Link
        href="/plans"
        className={`ml-auto rounded-lg px-3 py-1 text-xs font-semibold text-white transition-colors ${
          urgent ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"
        }`}
      >
        Choose a plan
      </Link>
    </div>
  );
}
