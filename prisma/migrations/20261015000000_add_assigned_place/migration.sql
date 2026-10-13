-- CreateEnum
CREATE TYPE "AssignedPlaceStatus" AS ENUM ('PENDING', 'VISITED', 'SKIPPED');

-- CreateTable
CREATE TABLE "AssignedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "AssignedPlaceStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "fieldVisitId" TEXT,
    "assignedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignedPlace_fieldVisitId_key" ON "AssignedPlace"("fieldVisitId");

-- CreateIndex
CREATE INDEX "AssignedPlace_userId_dayKey_idx" ON "AssignedPlace"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "AssignedPlace" ADD CONSTRAINT "AssignedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignedPlace" ADD CONSTRAINT "AssignedPlace_fieldVisitId_fkey" FOREIGN KEY ("fieldVisitId") REFERENCES "FieldVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
