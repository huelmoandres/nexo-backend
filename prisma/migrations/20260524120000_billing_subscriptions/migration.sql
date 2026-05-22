-- CreateEnum
CREATE TYPE "SubscriptionBillingStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_PAYMENT_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_GRACE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'SUBSCRIPTION_DOWNGRADED';

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT,
    "companyId" TEXT,
    "planCode" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionBillingStatus" NOT NULL,
    "trialEndsAt" TIMESTAMPTZ,
    "currentPeriodStart" TIMESTAMPTZ,
    "currentPeriodEnd" TIMESTAMPTZ,
    "graceEndsAt" TIMESTAMPTZ,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "dunningReminderSent" INTEGER NOT NULL DEFAULT 0,
    "lastDunningAt" TIMESTAMPTZ,
    "mpPreapprovalId" TEXT,
    "mpPreapprovalPlanId" TEXT,
    "externalReference" TEXT NOT NULL,
    "billingAmountUsdCents" INTEGER,
    "billingAmountUyuCents" INTEGER,
    "customAmountUsdCents" INTEGER,
    "exchangeRateId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_professionalProfileId_key" ON "BillingSubscription"("professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_companyId_key" ON "BillingSubscription"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_externalReference_key" ON "BillingSubscription"("externalReference");

-- CreateIndex
CREATE INDEX "BillingSubscription_status_idx" ON "BillingSubscription"("status");

-- CreateIndex
CREATE INDEX "BillingSubscription_graceEndsAt_idx" ON "BillingSubscription"("graceEndsAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_currentPeriodEnd_idx" ON "BillingSubscription"("currentPeriodEnd");

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
