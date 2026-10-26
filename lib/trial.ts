import { prisma } from "@/lib/prisma";

/** Length of the free trial, counted from the moment the admin activates the account. */
export const TRIAL_DAYS = 7;
/** Employees (not admins) an organization on the free trial may have at once. */
export const TRIAL_EMPLOYEE_LIMIT = 5;
/** The reminder email goes out when this many days (or fewer) of the trial are left. */
export const TRIAL_REMINDER_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialState = {
  /** A self-serve trial that hasn't been replaced by a plan. */
  onTrial: boolean;
  /** Null until the admin activates the account. */
  endsAt: Date | null;
  /** Whole days left, rounded up (6h left counts as 1 day). 0 once it has ended. */
  daysLeft: number | null;
  ended: boolean;
};

export function trialState(
  org: { isTrial: boolean; trialEndsAt: Date | null; planTier: string | null },
  now = new Date(),
): TrialState {
  const onTrial = org.isTrial && !org.planTier;
  if (!onTrial || !org.trialEndsAt) return { onTrial, endsAt: org.trialEndsAt, daysLeft: null, ended: false };
  const msLeft = org.trialEndsAt.getTime() - now.getTime();
  return { onTrial, endsAt: org.trialEndsAt, daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)), ended: msLeft <= 0 };
}

/**
 * Whether an organization on the free trial may add `adding` more active employees. Organizations that
 * aren't self-serve trials (the original organizations, paid ones) are never limited.
 */
export async function checkTrialEmployeeLimit(
  organizationId: string,
  adding: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { isTrial: true, planTier: true },
  });
  if (!org || !org.isTrial || org.planTier) return { ok: true };
  const current = await prisma.user.count({ where: { organizationId, role: "EMPLOYEE", active: true } });
  if (current + adding > TRIAL_EMPLOYEE_LIMIT) {
    const room = Math.max(0, TRIAL_EMPLOYEE_LIMIT - current);
    return {
      ok: false,
      error: `The free trial allows up to ${TRIAL_EMPLOYEE_LIMIT} employees${room > 0 ? ` (you can add ${room} more)` : ""}. Choose a plan to add more.`,
    };
  }
  return { ok: true };
}
