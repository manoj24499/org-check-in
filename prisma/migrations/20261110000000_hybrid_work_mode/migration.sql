-- HYBRID work mode: office part of the day, home part of the day, with
-- TRANSIT segments in between (see prisma/schema.prisma WorkMode/CheckInMode
-- and WorkSegment comments).

-- AlterEnum
ALTER TYPE "WorkMode" ADD VALUE 'HYBRID';

-- AlterEnum
ALTER TYPE "CheckInMode" ADD VALUE 'HOME';
ALTER TYPE "CheckInMode" ADD VALUE 'TRANSIT';

-- AlterTable
ALTER TABLE "WorkSegment" ADD COLUMN     "heading" "CheckInMode",
ADD COLUMN     "promptedAt" TIMESTAMP(3),
ADD COLUMN     "extendedAt" TIMESTAMP(3),
ADD COLUMN     "departurePromptedAt" TIMESTAMP(3);
