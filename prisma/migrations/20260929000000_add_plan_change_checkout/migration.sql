-- CreateEnum
CREATE TYPE "PlanChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED', 'NEEDS_ATTENTION');

-- CreateTable
CREATE TABLE "PlanChangeCheckout" (
    "id" TEXT NOT NULL,
    "publicRef" TEXT NOT NULL,
    "status" "PlanChangeStatus" NOT NULL DEFAULT 'PENDING',
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "pricePerSeatPaise" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricingVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "providerCustomerId" TEXT,
    "lastPaymentError" TEXT,
    "attentionReason" TEXT,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanChangeCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanChangeCheckout_publicRef_key" ON "PlanChangeCheckout"("publicRef");

-- CreateIndex
CREATE UNIQUE INDEX "PlanChangeCheckout_providerCheckoutId_key" ON "PlanChangeCheckout"("providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanChangeCheckout_providerPaymentId_key" ON "PlanChangeCheckout"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PlanChangeCheckout_organizationId_status_idx" ON "PlanChangeCheckout"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "PlanChangeCheckout" ADD CONSTRAINT "PlanChangeCheckout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
