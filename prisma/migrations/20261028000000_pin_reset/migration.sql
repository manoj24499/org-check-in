-- AlterTable
ALTER TABLE "User" ADD COLUMN "pinResetHash" TEXT,
ADD COLUMN "pinResetExpiresAt" TIMESTAMP(3),
ADD COLUMN "pinResetAttempts" INTEGER NOT NULL DEFAULT 0;
