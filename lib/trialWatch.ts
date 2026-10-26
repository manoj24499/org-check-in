import { prisma } from "@/lib/prisma";
import { APP_BASE_URL } from "@/lib/appUrl";
import { sendEmail, trialReminderEmail, trialEndedEmail } from "@/lib/email";
import { TRIAL_REMINDER_DAYS } from "@/lib/trial";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The organization's owner admin(s): who a trial email goes to. */
async function ownerAdmins(organizationId: string) {
  const [admins, org] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, role: "ADMIN", isOwner: true, active: true, passwordHash: { not: null } },
      select: { email: true, name: true },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { billingEmail: true } }),
  ]);
  // The organization's extra billing address gets the same email (once, even if it matches an admin).
  const extra = org?.billingEmail;
  if (admins.length > 0 && extra && !admins.some((a) => a.email.toLowerCase() === extra.toLowerCase())) {
    admins.push({ email: extra, name: admins[0].name });
  }
  return admins;
}

/**
 * Free-trial upkeep, run by the same 5-minute scheduler entry as the other jobs (see
 * app/api/cron/tracking-watch):
 *  - TRIAL_REMINDER_DAYS before the trial ends, emails the owner admin(s) once;
 *  - when the trial has run out with no plan chosen, suspends the organization (admins, employees, the kiosk
 *    and the mobile app are all turned away by the existing SUSPENDED checks) and emails the admin(s) once.
 * Organizations that aren't self-serve trials, or already chose a plan, are never touched. Each email is
 * sent at most once (trialReminderSentAt / trialEndedAt), and a failed email is retried on the next run
 * without repeating the suspension.
 */
export async function runTrialWatch(now = new Date()) {
  const plansUrl = `${APP_BASE_URL}/plans`;
  let reminded = 0;
  let suspended = 0;

  // 1. Reminders.
  const dueReminders = await prisma.organization.findMany({
    where: {
      isTrial: true,
      planTier: null,
      status: "ACTIVE",
      trialReminderSentAt: null,
      trialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * DAY_MS) },
    },
    select: { id: true, name: true, trialEndsAt: true },
  });
  for (const org of dueReminders) {
    const admins = await ownerAdmins(org.id);
    if (admins.length === 0 || !org.trialEndsAt) continue;
    const daysLeft = Math.max(1, Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / DAY_MS));
    try {
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          ...trialReminderEmail({ orgName: org.name, adminName: a.name, daysLeft, endsAt: org.trialEndsAt, plansUrl }),
        });
      }
      await prisma.organization.update({ where: { id: org.id }, data: { trialReminderSentAt: now } });
      reminded++;
    } catch (err) {
      console.error(`[trialWatch] reminder email failed for ${org.id}:`, err);
    }
  }

  // 2. Trials that have run out.
  const expired = await prisma.organization.findMany({
    where: { isTrial: true, planTier: null, status: "ACTIVE", trialEndsAt: { lte: now, not: null } },
    select: { id: true, name: true },
  });
  for (const org of expired) {
    await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED", trialEndedAt: now } });
    suspended++;
    try {
      for (const a of await ownerAdmins(org.id)) {
        await sendEmail({ to: a.email, ...trialEndedEmail({ orgName: org.name, adminName: a.name, plansUrl }) });
      }
    } catch (err) {
      console.error(`[trialWatch] trial-ended email failed for ${org.id}:`, err);
    }
  }

  return { reminded, suspended };
}
