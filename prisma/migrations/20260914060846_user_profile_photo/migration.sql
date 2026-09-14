-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasProfilePhoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profilePhoto" BYTEA;
