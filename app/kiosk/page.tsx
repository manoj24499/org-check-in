import KioskClient from "./KioskClient";

// Plain, org-less kiosk URL — kept working for already-bookmarked physical
// devices. The backend treats a missing orgSlug as "default" (this app's
// original, pre-multi-tenancy organization). New kiosks should be
// bookmarked at /kiosk/<org-slug> instead (see [orgSlug]/page.tsx).
export default function KioskPage() {
  return <KioskClient />;
}
