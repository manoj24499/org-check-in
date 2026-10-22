-- AlterEnum
ALTER TYPE "AttendanceMethod" ADD VALUE 'MANUAL';

-- CreateEnum
CREATE TYPE "ManualEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "manualReason" TEXT,
ADD COLUMN "manualApprovedByName" TEXT;

-- CreateTable
CREATE TABLE "ManualEntryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ManualEntryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByName" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "ManualEntryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualEntryRequest_userId_date_idx" ON "ManualEntryRequest"("userId", "date");

-- CreateIndex
CREATE INDEX "ManualEntryRequest_status_createdAt_idx" ON "ManualEntryRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ManualEntryRequest" ADD CONSTRAINT "ManualEntryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
