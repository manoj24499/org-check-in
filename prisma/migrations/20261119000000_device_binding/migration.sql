-- One registered phone per employee (see lib/deviceBinding.ts).
ALTER TABLE "User" ADD COLUMN "boundDeviceId" TEXT;
ALTER TABLE "User" ADD COLUMN "boundDeviceLabel" TEXT;
ALTER TABLE "User" ADD COLUMN "boundDeviceAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingDeviceId" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingDeviceLabel" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingDeviceAt" TIMESTAMP(3);
