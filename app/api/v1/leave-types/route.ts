import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerList } from "@/lib/partnerApi/response";

// Fixed, hardcoded enum (TimeOffType) — not a configurable per-organization
// catalog, so there's nothing to query. See the response doc: no unpaid
// leave concept exists (a request beyond quota isn't tracked as loss-of-pay
// anywhere yet), and no half-day leave *request* exists (TimeOffRequest.days
// is always a whole number) — so isPaid is true and allowsHalfDay is false
// for all three. "updatedAt" is a placeholder marking when this static list
// was last actually changed in code, not a per-row database timestamp.
const STATIC_UPDATED_AT = "2026-09-24T00:00:00.000Z";

const LEAVE_TYPES = [
  { code: "CASUAL", name: "Casual leave", category: "casual", isPaid: true, allowsHalfDay: false, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "SICK", name: "Sick leave", category: "sick", isPaid: true, allowsHalfDay: false, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "EARNED", name: "Earned leave", category: "paid", isPaid: true, allowsHalfDay: false, active: true, updatedAt: STATIC_UPDATED_AT },
];

export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async () => {
    return partnerList(LEAVE_TYPES, { limit: 200, nextCursor: null, totalCount: LEAVE_TYPES.length });
  });
}
