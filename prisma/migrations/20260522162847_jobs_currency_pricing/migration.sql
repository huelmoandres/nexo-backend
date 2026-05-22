/*
  Warnings:

  - You are about to drop the column `agreedAmountCents` on the `Job` table. All the data in the column will be lost.
  - Added the required column `currencyId` to the `Job` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmountCents` to the `Job` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JobPricingMode" AS ENUM ('ESTIMATE', 'FIXED');

-- CreateEnum
CREATE TYPE "JobPriceLineType" AS ENUM ('LABOR', 'MATERIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "JobChangeOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "exchangeRateId" TEXT,
ADD COLUMN     "jobAmountCents" INTEGER,
ADD COLUMN     "jobCurrencyId" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "agreedAmountCents",
ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "countryId" TEXT,
ADD COLUMN     "currencyId" TEXT NOT NULL,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "neighborhoodId" TEXT,
ADD COLUMN     "pricingMode" "JobPricingMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "stateId" TEXT,
ADD COLUMN     "totalAmountCents" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minorUnits" INTEGER NOT NULL DEFAULT 2,
    "bcuMonedaCode" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrencyId" TEXT NOT NULL,
    "quoteCurrencyId" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "buyRateMicros" INTEGER NOT NULL,
    "sellRateMicros" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BCU',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPriceLine" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "JobPriceLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPriceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChangeOrder" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "JobChangeOrderStatus" NOT NULL DEFAULT 'PENDING',
    "clientNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "JobChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChangeOrderLine" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "type" "JobPriceLineType" NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE INDEX "ExchangeRate_quoteCurrencyId_effectiveDate_idx" ON "ExchangeRate"("quoteCurrencyId", "effectiveDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseCurrencyId_quoteCurrencyId_effectiveDate_key" ON "ExchangeRate"("baseCurrencyId", "quoteCurrencyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "JobPriceLine_jobId_idx" ON "JobPriceLine"("jobId");

-- CreateIndex
CREATE INDEX "JobChangeOrder_jobId_status_idx" ON "JobChangeOrder"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobChangeOrderLine_changeOrderId_idx" ON "JobChangeOrderLine"("changeOrderId");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_baseCurrencyId_fkey" FOREIGN KEY ("baseCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_quoteCurrencyId_fkey" FOREIGN KEY ("quoteCurrencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "Currency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPriceLine" ADD CONSTRAINT "JobPriceLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChangeOrder" ADD CONSTRAINT "JobChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChangeOrder" ADD CONSTRAINT "JobChangeOrder_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChangeOrderLine" ADD CONSTRAINT "JobChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "JobChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_jobCurrencyId_fkey" FOREIGN KEY ("jobCurrencyId") REFERENCES "Currency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
