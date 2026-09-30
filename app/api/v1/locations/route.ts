import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerList } from "@/lib/partnerApi/response";

/** Exactly one office per organization exists today (see OfficeLocation's
 * schema comment) — not a list of sites. Returns zero or one entry rather
 * than fabricating a multi-site structure this app doesn't have. city/
 * state/countryCode are `null` (never collected here — only lat/long + a
 * geofence radius are stored), a real deviation from the contract's
 * "required" on those fields, documented in the response doc rather than
 * papered over with invented values. */
export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async (organizationId) => {
    const office = await prisma.officeLocation.findUnique({ where: { organizationId } });

    const data = office
      ? [
          {
            code: "MAIN",
            name: office.name,
            city: null,
            state: null,
            countryCode: null,
            timezone: "Asia/Kolkata",
            active: true,
            updatedAt: office.updatedAt.toISOString(),
          },
        ]
      : [];

    return partnerList(data, { limit: 200, nextCursor: null, totalCount: data.length });
  });
}
