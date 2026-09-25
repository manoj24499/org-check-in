-- DropForeignKey
ALTER TABLE "AppSettings" DROP CONSTRAINT "AppSettings_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "DeletedEmployeeArchive" DROP CONSTRAINT "DeletedEmployeeArchive_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "OfficeLocation" DROP CONSTRAINT "OfficeLocation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "PublicHoliday" DROP CONSTRAINT "PublicHoliday_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";

-- DropIndex
DROP INDEX "PublicHoliday_date_key";

-- DropIndex
DROP INDEX "User_employeeCode_key";

-- AlterTable
ALTER TABLE "AppSettings" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DeletedEmployeeArchive" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "OfficeLocation" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PublicHoliday" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_organizationId_date_key" ON "PublicHoliday"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_employeeCode_key" ON "User"("organizationId", "employeeCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedEmployeeArchive" ADD CONSTRAINT "DeletedEmployeeArchive_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
