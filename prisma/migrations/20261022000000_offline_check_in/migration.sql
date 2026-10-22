-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "recordedOffline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offlineReceivedAt" TIMESTAMP(3),
ADD COLUMN     "offlineTimeVerified" BOOLEAN,
ADD COLUMN     "offlineOutsideArea" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "offlineCheckInEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_clientId_key" ON "Attendance"("clientId");
