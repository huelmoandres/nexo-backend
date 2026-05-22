-- Fase 5: geo de profesionales solo vía ServiceArea (columna location obsoleta).

DROP INDEX IF EXISTS "ProfessionalProfile_location_idx";

ALTER TABLE "ProfessionalProfile" DROP COLUMN IF EXISTS "location";
