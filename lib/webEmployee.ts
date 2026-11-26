import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMobileUser } from "@/lib/mobileAuth";

/** Shown when a My Page action is refused as unauthorized: usually the browser's sign-in changed under an open tab. */
export const SESSION_CHANGED_MESSAGE =
  "Your sign-in has changed or expired (for example, another account was signed in from a different tab). Reload this page and sign in again."

/**
 * The employee signed in on the website (ID + PIN login to My Page), if any. Shaped like the mobile app's
 * sign-in so the check-in and status routes treat both the same: the person is already proven, so no PIN is
 * asked again, and they can only act on their own record.
 */
export async function requireWebEmployee(): Promise<{ sub: string; employeeCode: string; organizationId: string } | null> {
  const session = await auth();
  const u = session?.user;
  if (!u || u.role !== "EMPLOYEE" || !u.id || !u.organizationId || !u.employeeCode) {
    console.warn(`[webEmployee] refused: ${!u ? "no session" : `role=${u.role ?? "none"}, id=${u.id ? "yes" : "no"}, org=${u.organizationId ? "yes" : "no"}, code=${u.employeeCode ? "yes" : "no"}`}`);
    return null;
  }
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
