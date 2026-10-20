-- AlterTable
ALTER TABLE "User" ADD COLUMN "pinLookupHash" TEXT;

-- CreateIndex
CREATE INDEX "User_organizationId_pinLookupHash_idx" ON "User"("organizationId", "pinLookupHash");
