-- AlterTable
ALTER TABLE "FieldVisit" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FieldVisit_clientId_key" ON "FieldVisit"("clientId");
