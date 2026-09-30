
-- CreateEnum
CREATE TYPE "SignupCheckoutStatus" AS ENUM ('PENDING', 'PROVISIONED', 'CANCELLED', 'NEEDS_ATTENTION');

-- CreateEnum
CREATE TYPE "UserTokenPurpose" AS ENUM ('ACCOUNT_ACTIVATION');

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "outcome" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupCheckout" (
    "id" TEXT NOT NULL,
    "publicRef" TEXT NOT NULL,
    "status" "SignupCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "planId" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "pricePerSeatPaise" INTEGER NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricingVersion" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "providerCustomerId" TEXT,
    "lastPaymentError" TEXT,
    "attentionReason" TEXT,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "activationEmailSentAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "adminUserId" TEXT,
    "createdIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "UserTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_eventId_key" ON "PaymentEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "SignupCheckout_publicRef_key" ON "SignupCheckout"("publicRef");

-- CreateIndex
CREATE UNIQUE INDEX "SignupCheckout_providerCheckoutId_key" ON "SignupCheckout"("providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "SignupCheckout_providerPaymentId_key" ON "SignupCheckout"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SignupCheckout_organizationId_key" ON "SignupCheckout"("organizationId");

-- CreateIndex
CREATE INDEX "SignupCheckout_slug_status_idx" ON "SignupCheckout"("slug", "status");

-- CreateIndex
CREATE INDEX "SignupCheckout_adminEmail_status_idx" ON "SignupCheckout"("adminEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_purpose_idx" ON "UserToken"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "SignupCheckout" ADD CONSTRAINT "SignupCheckout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

