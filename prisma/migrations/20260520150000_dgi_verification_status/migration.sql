-- CreateEnum
CREATE TYPE "DgiVerificationStatus" AS ENUM ('UNVERIFIED', 'PROCESSING', 'VERIFIED_AUTO', 'PENDING_MANUAL_REVIEW', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "dgiVerificationStatus" "DgiVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN "dgiVerificationMethod" TEXT,
ADD COLUMN "dgiRazonSocial" TEXT,
ADD COLUMN "dgiVerifiedAt" TIMESTAMPTZ,
ADD COLUMN "dgiVerificationDocKey" TEXT;

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN "dgiVerificationStatus" "DgiVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN "dgiVerificationMethod" TEXT,
ADD COLUMN "dgiRazonSocial" TEXT,
ADD COLUMN "dgiVerifiedAt" TIMESTAMPTZ,
ADD COLUMN "dgiVerificationDocKey" TEXT;
