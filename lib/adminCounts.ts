import { prisma } from "@/lib/prisma";
import { startOfISTDay } from "@/lib/istTime";

/** The pending counts shown as badges on the admin sidebar (leave, overtime, support). */
export async function getPendingCounts(organizationId: string) {
  const [leave, overtime, support] = await Promise.all([
    prisma.timeOffRequest.count({ where: { status: "PENDING", user: { organizationId } } }),
    prisma.overtimeRequest.count({ where: { status: "PENDING", attendance: { user: { organizationId } } } }),
    prisma.supportTicket.count({ where: { status: "OPEN", user: { organizationId } } }),
  ]);
  return { leave, overtime, support };
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * A short fingerprint of everything the admin pages show that changes on its own: which requests are
 * pending, today's check-ins and check-outs. When it changes, the open page is re-rendered with fresh data.
 */
export async function getLiveSignature(organizationId: string, extra: string[] = []): Promise<string> {
  const [leave, overtime, support, attendanceToday] = await Promise.all([
    prisma.timeOffRequest.findMany({ where: { status: "PENDING", user: { organizationId } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.overtimeRequest.findMany({ where: { status: "PENDING", attendance: { user: { organizationId } } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.supportTicket.findMany({ where: { status: "OPEN", user: { organizationId } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.attendance.count({ where: { timestamp: { gte: startOfISTDay() }, user: { organizationId } } }),
  ]);
  const parts = [
    leave.map((r) => r.id).join(","),
    overtime.map((r) => r.id).join(","),
    support.map((r) => r.id).join(","),
    String(attendanceToday),
    ...extra,
  ];
  return hash(parts.join("|"));
}
