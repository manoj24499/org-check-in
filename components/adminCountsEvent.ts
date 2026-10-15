export const COUNTS_REFRESH_EVENT = "admin-counts-refresh";

/** Call after approving, declining, deleting or resolving something, so the sidebar badges update at once. */
export function refreshAdminCounts() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(COUNTS_REFRESH_EVENT));
}
