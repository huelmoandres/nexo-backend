-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN "rut" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalProfile_rut_key" ON "ProfessionalProfile"("rut");
