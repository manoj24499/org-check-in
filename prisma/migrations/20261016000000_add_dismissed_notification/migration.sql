-- CreateTable
CREATE TABLE "DismissedNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dismissedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DismissedNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DismissedNotification_createdAt_idx" ON "DismissedNotification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DismissedNotification_organizationId_key_key" ON "DismissedNotification"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "DismissedNotification" ADD CONSTRAINT "DismissedNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
