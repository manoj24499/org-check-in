-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "autoCheckoutWarnedAt" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "odometerEstimated" BOOLEAN NOT NULL DEFAULT false;
