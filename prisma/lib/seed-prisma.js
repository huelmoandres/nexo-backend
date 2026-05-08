/**
 * Cliente Prisma para scripts de seed (adapter PrismaPg + `DATABASE_URL`).
 * Misma convención que `prisma/seed.geo.js` y `prisma/backfill.trust-identity.js`.
 */
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

function createSeedPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for Prisma seed scripts');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

module.exports = { createSeedPrisma };
