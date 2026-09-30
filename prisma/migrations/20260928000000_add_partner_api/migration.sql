-- AlterTable
-- Existing rows are backfilled to "now" — their real last-modified time
-- isn't known, so this is the closest honest value (see the schema comment
-- on Attendance.updatedAt).
ALTER TABLE "Attendance" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Attendance_updatedAt_idx" ON "Attendance"("updatedAt");

-- CreateTable
CREATE TABLE "OrganizationApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApiKey_keyHash_key" ON "OrganizationApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "OrganizationApiKey_organizationId_idx" ON "OrganizationApiKey"("organizationId");

-- AddForeignKey
ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
