import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerList } from "@/lib/partnerApi/response";

// No status catalog exists internally in this app (see the response doc) —
// state is inferred at read time by lib/partnerApi/attendanceRecords.ts, not
// stored as a code anywhere. This list is that catalog's first-ever
// definition, published here rather than exported from an existing table.
const STATIC_UPDATED_AT = "2026-09-28T00:00:00.000Z";

const STATUSES = [
  { code: "PRESENT", name: "Present", meaning: "worked", countsAsPresent: true, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "HALF_DAY", name: "Half day", meaning: "worked", countsAsPresent: true, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "ABSENT", name: "Absent", meaning: "absent", countsAsPresent: false, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "ON_LEAVE", name: "On leave", meaning: "leave", countsAsPresent: false, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "HOLIDAY", name: "Holiday", meaning: "holiday", countsAsPresent: false, active: true, updatedAt: STATIC_UPDATED_AT },
  { code: "WEEKLY_OFF", name: "Weekly off", meaning: "weekly_off", countsAsPresent: false, active: true, updatedAt: STATIC_UPDATED_AT },
];

export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async () => {
    return partnerList(STATUSES, { limit: 200, nextCursor: null, totalCount: STATUSES.length });
  });
}
