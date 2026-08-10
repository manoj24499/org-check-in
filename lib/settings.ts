import { prisma } from "@/lib/prisma";

/** Fetches the singleton app settings row, creating it with defaults on first read. */
export async function getSettings() {
  const existing = await prisma.appSettings.findFirst();
  if (existing) return existing;
  return prisma.appSettings.create({ data: {} });
}

export async function updateSettings(data: {
  checkOutPhotoRequired?: boolean;
  reimbursementRatePerKm?: number | null;
}) {
  const existing = await getSettings();
  return prisma.appSettings.update({ where: { id: existing.id }, data });
}
