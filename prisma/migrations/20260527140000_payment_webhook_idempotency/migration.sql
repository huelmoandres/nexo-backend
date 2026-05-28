-- CreateEnum
CREATE TYPE "PaymentWebhookIdempotencyStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PaymentWebhookIdempotency" (
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "PaymentWebhookIdempotencyStatus" NOT NULL,
    "externalRef" TEXT,
    "jobId" TEXT,
    "providerReference" TEXT,
    "outcomeSummary" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,

    CONSTRAINT "PaymentWebhookIdempotency_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE INDEX "PaymentWebhookIdempotency_status_createdAt_idx" ON "PaymentWebhookIdempotency"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookIdempotency_jobId_idx" ON "PaymentWebhookIdempotency"("jobId");
