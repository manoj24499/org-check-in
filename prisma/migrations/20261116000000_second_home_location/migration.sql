-- Optional second home location for Work-from-home employees (either one counts as "home").
ALTER TABLE "User" ADD COLUMN "home2Latitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "home2Longitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "home2RadiusMeters" DOUBLE PRECISION NOT NULL DEFAULT 50;
