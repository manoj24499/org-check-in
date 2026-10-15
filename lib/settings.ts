import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Fetches one organization's settings row, creating it with defaults on first read. */
export async function getSettings(organizationId: string) {
  const existing = await prisma.appSettings.findUnique({ where: { organizationId } });
  if (existing) return existing;
  try {
    return await prisma.appSettings.create({ data: { organizationId } });
  } catch (err) {
    // Several requests can arrive together for an organization that has no row yet (its first busy moment);
    // they all try to create it and all but one hit the unique constraint on organizationId. The row now
    // exists, so read it instead of failing the request.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.appSettings.findUniqueOrThrow({ where: { organizationId } });
    }
    throw err;
  }
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
