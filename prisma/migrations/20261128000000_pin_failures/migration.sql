-- Wrong-PIN attempts at the web and phone sign-in, for the admin's repeated-failure alert.
CREATE TABLE "PinFailure" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "PinFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PinFailure_organizationId_createdAt_idx" ON "PinFailure"("organizationId", "createdAt");
CREATE INDEX "PinFailure_userId_createdAt_idx" ON "PinFailure"("userId", "createdAt");
