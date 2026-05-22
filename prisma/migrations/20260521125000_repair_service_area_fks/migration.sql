-- Reparación tras eliminar migración espuria 20260521020526_npm_run_db_migrate_dev
-- (había quitado FKs de ServiceArea con ON DELETE SET NULL).

ALTER TABLE "ServiceArea" DROP CONSTRAINT IF EXISTS "ServiceArea_companyId_fkey";
ALTER TABLE "ServiceArea" DROP CONSTRAINT IF EXISTS "ServiceArea_professionalProfileId_fkey";

ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_professionalProfileId_fkey"
    FOREIGN KEY ("professionalProfileId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
