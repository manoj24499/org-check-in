import KioskClient from "../KioskClient";

// A specific organization's physical kiosk URL, e.g. /kiosk/acme-corp —
// bookmarked once on that device (see Organization.slug's schema comment).
// Every request this page's client makes carries orgSlug along so the
// backend can resolve which organization's employees/settings/geofence
// apply, without requiring the employee to type it on every scan.
export default async function OrgKioskPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <KioskClient orgSlug={orgSlug} />;
}
