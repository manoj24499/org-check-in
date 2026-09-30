import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPartnerAuth } from "@/lib/partnerApi/withAuth";
import { partnerError, partnerList, encodeCursor, decodeCursor, parseLimit } from "@/lib/partnerApi/response";
import { getSettings } from "@/lib/settings";
import { istDateKey } from "@/lib/istTime";

const LEAVE_TYPES = ["CASUAL", "SICK", "EARNED"] as const;
const QUOTA_FIELD = { CASUAL: "casualLeaveQuota", SICK: "sickLeaveQuota", EARNED: "earnedLeaveQuota" } as const;

/** Our combined `name` has no first/last split — first token is treated as
 * firstName, the rest (if any) as lastName. Documented in the response doc
 * as an approximation, not a real split of two independently-stored fields. */
function splitName(name: string): { firstName: string; lastName: string | null } {
  const trimmed = name.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: null };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

export async function GET(req: NextRequest) {
  return withPartnerAuth(req, async (organizationId) => {
    const params = req.nextUrl.searchParams;
    const limit = parseLimit(params.get("limit"));
    const cursorId = decodeCursor(params.get("cursor"));

    const updatedSinceParam = params.get("updatedSince");
    const updatedSince = updatedSinceParam ? new Date(updatedSinceParam) : null;
    if (updatedSinceParam && Number.isNaN(updatedSince?.getTime())) {
      return partnerError("VALIDATION_ERROR", "updatedSince must be a valid timestamp.", { updatedSince: "Invalid timestamp" });
    }

    const codesParam = params.get("employeeCode");
    const codes = codesParam ? codesParam.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100) : null;

    const statusParam = params.get("status") ?? "all";
    if (!["active", "inactive", "all"].includes(statusParam)) {
      return partnerError("VALIDATION_ERROR", "status must be one of active, inactive, all.", { status: "Invalid value" });
    }

    const leaveYearParam = params.get("leaveYear");
    const year = leaveYearParam && /^\d{4}$/.test(leaveYearParam) ? Number(leaveYearParam) : Number(istDateKey().slice(0, 4));

    const where = {
      organizationId,
      role: "EMPLOYEE" as const,
      ...(codes ? { employeeCode: { in: codes } } : {}),
      ...(statusParam !== "all" ? { active: statusParam === "active" } : {}),
      ...(updatedSince ? { updatedAt: { gt: updatedSince } } : {}),
    };

    const [users, totalCount, officeLocation] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { id: "asc" },
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        take: limit + 1,
        select: { id: true, employeeCode: true, name: true, email: true, active: true, deactivatedAt: true, updatedAt: true },
      }),
      prisma.user.count({ where: { organizationId, role: "EMPLOYEE" } }),
      prisma.officeLocation.findUnique({ where: { organizationId }, select: { id: true } }),
    ]);

    const hasMore = users.length > limit;
    const page = users.slice(0, limit);

    const settings = await getSettings(organizationId);
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const data = await Promise.all(
      page.map(async (u) => {
        const { firstName, lastName } = splitName(u.name);
        const approved = await prisma.timeOffRequest.findMany({
          where: { userId: u.id, status: "APPROVED", startDate: { gte: yearStart, lt: yearEnd } },
          select: { type: true, days: true },
        });

        const leaveAllowances = LEAVE_TYPES.map((type) => {
          const used = approved.filter((r) => r.type === type).reduce((sum, r) => sum + r.days, 0);
          const quota = settings[QUOTA_FIELD[type]];
          return {
            leaveTypeCode: type,
            leaveYear: String(year),
            periodStart: `${year}-01-01`,
            periodEnd: `${year}-12-31`,
            allowedDays: quota,
            // No carry-forward mechanism exists (see the response doc) — a
            // fresh quota every calendar year, always zero.
            carriedForwardDays: 0,
            usedDays: used,
            balanceDays: Math.max(0, quota - used),
          };
        });

        return {
          id: u.id,
          employeeCode: u.employeeCode,
          firstName,
          lastName,
          email: u.email,
          // Not collected anywhere in this app today (see the response doc).
          phone: null,
          status: u.active ? "active" : "inactive",
          // Not tracked — only a deactivation timestamp exists, not a
          // joining date.
          dateOfJoining: null,
          dateOfExit: u.deactivatedAt ? istDateKey(u.deactivatedAt) : null,
          // Exactly one office per company today — a fixed code when one is
          // configured, null otherwise, rather than a real per-site code.
          locationCode: officeLocation ? "MAIN" : null,
          // Employees rotate shifts per weekday (see ShiftAssignment) rather
          // than having one fixed default shift — nothing honest to put here.
          shiftCode: null,
          leaveAllowances,
          updatedAt: u.updatedAt.toISOString(),
        };
      }),
    );

    return partnerList(data, {
      limit,
      nextCursor: hasMore ? encodeCursor(page[page.length - 1].id) : null,
      totalCount,
    });
  });
}
