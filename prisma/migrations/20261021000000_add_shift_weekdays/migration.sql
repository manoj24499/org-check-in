-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[];
