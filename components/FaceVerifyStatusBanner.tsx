import { AlertTriangle } from "lucide-react";

/**
 * Surfaces face-verification service problems to the admin without them
 * having to know to check /api/health themselves — this app's own history
 * this week was employees unable to complete face setup or check-ins
 * silently skipping verification (fails open by design, see
 * lib/faceVerify.ts) while the admin had zero visibility into why. Renders
 * nothing when everything's fine, matching this app's existing "no noise
 * unless there's something to say" convention (e.g. RecentActivityList).
 */
export function FaceVerifyStatusBanner({
  status,
  unavailableCheckInsToday,
}: {
  status: "ok" | "unreachable" | "not_configured";
  unavailableCheckInsToday: number;
}) {
  if (status === "ok" && unavailableCheckInsToday === 0) return null;

  const message =
    status !== "ok"
      ? "Face verification service is currently unreachable. Check-ins are still being accepted, but without face verification."
      : `${unavailableCheckInsToday} check-in${unavailableCheckInsToday === 1 ? "" : "s"} today proceeded without face verification — the service was temporarily unreachable.`;

  return (
    <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800 sm:px-7">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
