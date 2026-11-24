import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

/**
 * The employee signed in on the website (ID + PIN login to My Page), if any. Shaped like the mobile app's
 * sign-in so the check-in and status routes treat both the same: the person is already proven, so no PIN is
 * asked again, and they can only act on their own record.
 */
export async function requireWebEmployee(): Promise<{ sub: string; employeeCode: string; organizationId: string } | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || u.role !== "EMPLOYEE" || !u.id || !u.organizationId || !u.employeeCode) return null;
  // The session lasts up to 30 days: make sure the account is still allowed in today.
  const row = await prisma.user.findUnique({ where: { id: u.id }, select: { active: true, organizationId: true } });
  if (!row?.active || row.organizationId !== u.organizationId) return null;
  return { sub: u.id, employeeCode: u.employeeCode, organizationId: u.organizationId };
}

/** The signed-in employee, whether they came from the phone app (bearer token) or the website (My Page session). */
export async function requireEmployee(req: Request): Promise<{ sub: string; organizationId: string } | null> {
  const mobile = await requireMobileUser(req);
  if (mobile) return { sub: mobile.sub, organizationId: mobile.organizationId };
  return requireWebEmployee();
}
