import { prisma } from "@/lib/prisma";

/** Fetches one organization's settings row, creating it with defaults on first read. */
export async function getSettings(organizationId: string) {
  const existing = await prisma.appSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  return prisma.appSettings.create({ data: { organizationId } });
}

export async function updateSettings(
  organizationId: string,
  data: {
    checkOutPhotoRequired?: boolean;
    reimbursementRatePerKm?: number | null;
    casualLeaveQuota?: number;
    sickLeaveQuota?: number;
    earnedLeaveQuota?: number;
    lateThresholdMinutes?: number;
  },
) {
  return prisma.appSettings.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });
}
