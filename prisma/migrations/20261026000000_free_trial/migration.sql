-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "trialEndedAt" TIMESTAMP(3),
ADD COLUMN     "signupPhone" TEXT,
ADD COLUMN     "signupTeamSize" TEXT,
ADD COLUMN     "signupIndustry" TEXT;
