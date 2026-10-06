-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "odometerKm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "FieldVisit" ADD COLUMN "contactName" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "remarks" TEXT;

-- AlterTable
ALTER TABLE "LocationPing" ADD COLUMN "isTrail" BOOLEAN NOT NULL DEFAULT false;
