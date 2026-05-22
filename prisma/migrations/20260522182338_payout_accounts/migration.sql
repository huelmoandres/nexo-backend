-- CreateEnum
CREATE TYPE "EscrowPayoutStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MERCADO_PAGO', 'BANK');

-- CreateEnum
CREATE TYPE "PayoutSubjectType" AS ENUM ('PROFESSIONAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "PayoutIdentifierType" AS ENUM ('MP_CVU', 'MP_ALIAS', 'MP_EMAIL', 'MP_PHONE', 'BANK_TRANSFER_KEY');

-- CreateEnum
CREATE TYPE "PayoutAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutAttemptTrigger" AS ENUM ('RELEASE_FLOW', 'ADMIN_RETRY', 'SYSTEM_RETRY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_ACCOUNT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_ACCOUNT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_ACCOUNT_SET_PRIMARY';
ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_ATTEMPT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYOUT_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'RETRY_PAYOUT';

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "payoutAccountId" TEXT,
ADD COLUMN     "payoutStatus" "EscrowPayoutStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "payoutAccountId" TEXT;

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bcuPrefix" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "subjectType" "PayoutSubjectType" NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "label" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "professionalProfileId" TEXT,
    "companyId" TEXT,
    "identifierType" "PayoutIdentifierType" NOT NULL,
    "transferIdentifier" TEXT,
    "mpAlias" TEXT,
    "accountHolderName" TEXT,
    "bankId" TEXT,
    "verifiedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "escrowTransactionId" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PayoutAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "netAmountCents" INTEGER NOT NULL,
    "destinationSnapshot" JSONB NOT NULL,
    "providerReference" TEXT,
    "providerStatus" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "triggeredBy" "PayoutAttemptTrigger" NOT NULL,
    "triggeredByUserId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_code_key" ON "Bank"("code");

-- CreateIndex
CREATE INDEX "PayoutAccount_subjectType_professionalProfileId_idx" ON "PayoutAccount"("subjectType", "professionalProfileId");

-- CreateIndex
CREATE INDEX "PayoutAccount_subjectType_companyId_idx" ON "PayoutAccount"("subjectType", "companyId");

-- CreateIndex
CREATE INDEX "PayoutAttempt_status_createdAt_idx" ON "PayoutAttempt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_escrowTransactionId_attemptNumber_key" ON "PayoutAttempt"("escrowTransactionId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_escrowTransactionId_fkey" FOREIGN KEY ("escrowTransactionId") REFERENCES "EscrowTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PayoutAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
