-- CreateEnum
CREATE TYPE "PortfolioItemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN_PENDING_REVIEW', 'HIDDEN_BY_ADMIN');

-- CreateEnum
CREATE TYPE "AiModerationStatus" AS ENUM ('PENDING', 'OK', 'FLAGGED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConsentDeclineReason" AS ENUM ('NOT_MINE', 'INAPPROPRIATE', 'INACCURATE', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "ModerationTransitionType" AS ENUM ('INITIAL', 'RE_MODERATION', 'AUTO_RESTORE_AFTER_CORRECTION', 'ADMIN_OVERRIDE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PORTFOLIO_CONSENT_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'PORTFOLIO_CONSENT_DECLINED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PORTFOLIO_AI_FLAGGED';
ALTER TYPE "NotificationType" ADD VALUE 'PORTFOLIO_CONSENT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PORTFOLIO_CONSENT_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'PORTFOLIO_CONSENT_RESOLVED';

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "PortfolioItemStatus" NOT NULL DEFAULT 'DRAFT',
    "jobId" TEXT,
    "verifiedFromJob" BOOLEAN NOT NULL DEFAULT false,
    "aiModerationStatus" "AiModerationStatus" NOT NULL DEFAULT 'PENDING',
    "aiModerationReason" TEXT,
    "aiModerationModelRef" TEXT,
    "aiModeratedAt" TIMESTAMPTZ,
    "publishedAt" TIMESTAMPTZ,
    "cleanedUpAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioPhoto" (
    "id" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "caption" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "aiFlagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioConsent" (
    "id" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" "ConsentDeclineReason",
    "declineNotes" TEXT,
    "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderAttemptedAt" TIMESTAMPTZ,
    "reminderSentAt" TIMESTAMPTZ,
    "respondedAt" TIMESTAMPTZ,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PortfolioConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioModerationLog" (
    "id" TEXT NOT NULL,
    "portfolioItemId" TEXT NOT NULL,
    "modelRef" TEXT NOT NULL,
    "transitionType" "ModerationTransitionType" NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "scores" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "scoredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioItem_jobId_key" ON "PortfolioItem"("jobId");

-- CreateIndex
CREATE INDEX "PortfolioItem_professionalId_status_idx" ON "PortfolioItem"("professionalId", "status");

-- CreateIndex
CREATE INDEX "PortfolioItem_categoryId_status_idx" ON "PortfolioItem"("categoryId", "status");

-- CreateIndex
CREATE INDEX "PortfolioItem_aiModerationModelRef_aiModeratedAt_idx" ON "PortfolioItem"("aiModerationModelRef", "aiModeratedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioPhoto_fileKey_key" ON "PortfolioPhoto"("fileKey");

-- CreateIndex
CREATE INDEX "PortfolioPhoto_portfolioItemId_displayOrder_idx" ON "PortfolioPhoto"("portfolioItemId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioConsent_portfolioItemId_key" ON "PortfolioConsent"("portfolioItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioConsent_token_key" ON "PortfolioConsent"("token");

-- CreateIndex
CREATE INDEX "PortfolioConsent_status_expiresAt_idx" ON "PortfolioConsent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PortfolioModerationLog_portfolioItemId_scoredAt_idx" ON "PortfolioModerationLog"("portfolioItemId", "scoredAt");

-- CreateIndex
CREATE INDEX "PortfolioModerationLog_modelRef_scoredAt_idx" ON "PortfolioModerationLog"("modelRef", "scoredAt");

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioPhoto" ADD CONSTRAINT "PortfolioPhoto_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioConsent" ADD CONSTRAINT "PortfolioConsent_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioModerationLog" ADD CONSTRAINT "PortfolioModerationLog_portfolioItemId_fkey" FOREIGN KEY ("portfolioItemId") REFERENCES "PortfolioItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Trigger: portfolio_item_freeze_after_verification
-- Impide mutar jobId o categoryId una vez que verifiedFromJob = true.
-- Aplica tanto a updates manuales como a cualquier UPDATE vía Prisma/ORM.
-- El Service debe fallar antes con 409, pero el trigger es la última línea de
-- defensa (defense-in-depth). Idempotente: CREATE OR REPLACE + DROP IF EXISTS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portfolio_item_freeze_after_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."verifiedFromJob" = true AND (
       NEW."jobId"      IS DISTINCT FROM OLD."jobId"
    OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
  ) THEN
    RAISE EXCEPTION
      'verified portfolio items have frozen jobId/categoryId (itemId: %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_item_freeze_after_verification_trg
  ON public."PortfolioItem";

CREATE TRIGGER portfolio_item_freeze_after_verification_trg
  BEFORE UPDATE ON public."PortfolioItem"
  FOR EACH ROW
  EXECUTE FUNCTION public.portfolio_item_freeze_after_verification();
