-- CreateEnum
CREATE TYPE "ProcessAuditSource" AS ENUM ('HTTP', 'WEBHOOK', 'WORKER', 'CRON', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProcessAuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProcessAuditDomain" AS ENUM ('PAYMENTS', 'BILLING', 'ESCROW', 'PAYOUT', 'JOBS', 'DGI', 'PORTFOLIO', 'AUTH', 'EXCHANGE_RATES', 'OTHER');

-- CreateTable
CREATE TABLE "ProcessAudit" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "domain" "ProcessAuditDomain" NOT NULL,
    "operation" TEXT NOT NULL,
    "outcome" "ProcessAuditOutcome" NOT NULL,
    "source" "ProcessAuditSource" NOT NULL,
    "severity" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "httpStatus" INTEGER,
    "problemCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "jobId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessAudit_correlationId_idx" ON "ProcessAudit"("correlationId");

-- CreateIndex
CREATE INDEX "ProcessAudit_domain_operation_createdAt_idx" ON "ProcessAudit"("domain", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessAudit_entityId_idx" ON "ProcessAudit"("entityId");

-- CreateIndex
CREATE INDEX "ProcessAudit_createdAt_idx" ON "ProcessAudit"("createdAt");
