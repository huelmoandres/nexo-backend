import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach } from 'vitest';
import { seedPlanCatalog } from './seed-plan-catalog';

/**
 * Setup ejecutado antes/después de cada ARCHIVO de test de integración (e2e).
 *
 * Limpia la base de datos de Testcontainers entre archivos de test para
 * garantizar aislamiento. No destruye el container (eso lo hace global-setup.ts).
 *
 * El orden de truncate respeta las FK constraints del schema de Prisma.
 */

let prisma: PrismaClient;

beforeEach(async () => {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definido para tests e2e');
  }
  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  // Truncar todas las tablas en orden inverso a las FK para evitar violaciones.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Notification",
      "AuditLog",
      "Review",
      "WorkEvidence",
      "Dispute",
      "EscrowTransaction",
      "Urgency",
      "Job",
      "ProfessionalCategory",
      "CompanyCategory",
      "ServiceArea",
      "BillingSubscription",
      "ProfessionalProfile",
      "Company",
      "PlanDefinition",
      "Category",
      "User",
      "City",
      "State",
      "Country"
    RESTART IDENTITY CASCADE;
  `);

  await seedPlanCatalog(prisma);
});

afterEach(async () => {
  await prisma.$disconnect();
});
