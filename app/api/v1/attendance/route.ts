import { NextRequest } from "next/server";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerError, partnerList, encodeCursor, decodeCursor, parseLimit } from "@/lib/partnerApi/response";
import { parseDateOnlyKey } from "@/lib/istTime";
import { buildDailyAttendanceRange, buildDailyAttendanceSince } from "@/lib/partnerApi/attendanceRecords";

const MAX_RANGE_DAYS = 62;

export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async (organizationId) => {
    const params = req.nextUrl.searchParams;
    const limit = parseLimit(params.get("limit"), 500);
    const cursorOffset = decodeCursor(params.get("cursor"));
    const offset = cursorOffset ? Number(cursorOffset) : 0;

    const codesParam = params.get("employeeCode");
    const employeeCodes = codesParam ? codesParam.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100) : null;
    const includePunches = params.get("includePunches") === "true";

    const updatedSinceParam = params.get("updatedSince");
    const fromParam = params.get("from");
    const toParam = params.get("to");

    let records;

    if (updatedSinceParam) {
      const since = new Date(updatedSinceParam);
      if (Number.isNaN(since.getTime())) {
        return partnerError("VALIDATION_ERROR", "updatedSince must be a valid timestamp.", { updatedSince: "Invalid timestamp" });
      }
      records = await buildDailyAttendanceSince(organizationId, { since, employeeCodes, includePunches });
    } else {
      if (!fromParam || !toParam) {
        return partnerError("VALIDATION_ERROR", "from and to are required unless updatedSince is sent.", {
          from: fromParam ? undefined : "Required",
          to: toParam ? undefined : "Required",
        });
      }
      const from = parseDateOnlyKey(fromParam);
      const to = parseDateOnlyKey(toParam);
      if (!from || !to) {
        return partnerError("VALIDATION_ERROR", "from and to must be YYYY-MM-DD dates.", { from: "Invalid", to: "Invalid" });
      }
      if (to.getTime() < from.getTime()) {
        return partnerError("VALIDATION_ERROR", "to must not be before from.", { to: "Must be on or after from" });
      }
      const rangeDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      if (rangeDays > MAX_RANGE_DAYS) {
        return partnerError("VALIDATION_ERROR", `The date range can be at most ${MAX_RANGE_DAYS} days.`, {
          to: `Must be within ${MAX_RANGE_DAYS} days of from`,
        });
      }
      records = await buildDailyAttendanceRange(organizationId, { from, to, employeeCodes, includePunches });
    }

    const page = records.slice(offset, offset + limit);
    const hasMore = offset + limit < records.length;

    return partnerList(page, {
      limit,
      nextCursor: hasMore ? encodeCursor(String(offset + limit)) : null,
      totalCount: records.length,
    });
  });
}
