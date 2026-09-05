-- CreateEnum
CREATE TYPE "OvertimeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "shiftReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shiftRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "estimatedEndAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OvertimeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "workSummary" TEXT,
    "photo" BYTEA,
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OvertimeRequest_attendanceId_idx" ON "OvertimeRequest"("attendanceId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_status_createdAt_idx" ON "OvertimeRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
