-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('TRADE', 'SERVICE');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "type" "CategoryType" NOT NULL DEFAULT 'TRADE';

-- Existing child category from prior seed
UPDATE "Category" SET "type" = 'SERVICE' WHERE "slug" = 'electricidad-urgencias';
