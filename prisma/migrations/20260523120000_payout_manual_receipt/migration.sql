-- AlterEnum
ALTER TYPE "PayoutAttemptTrigger" ADD VALUE 'ADMIN_MANUAL';

-- AlterTable
ALTER TABLE "PayoutAttempt" ADD COLUMN "receiptStorageKey" TEXT,
ADD COLUMN "adminPayoutNote" TEXT;
