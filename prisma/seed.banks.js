/**
 * Seed bancos Uruguay para PayoutAccount BANK.
 * Ejecutar: node prisma/seed.banks.js
 */
require('dotenv/config');
const { createSeedPrisma } = require('./lib/seed-prisma.js');

const BANKS = [
  { code: 'BROU', name: 'Banco República (BROU)', bcuPrefix: '001' },
  { code: 'SANTANDER', name: 'Santander Uruguay', bcuPrefix: '137' },
  { code: 'ITAU', name: 'Itaú Uruguay', bcuPrefix: '113' },
  { code: 'SCOTIABANK', name: 'Scotiabank Uruguay', bcuPrefix: '128' },
  { code: 'BBVA', name: 'BBVA Uruguay', bcuPrefix: '153' },
  { code: 'HERITAGE', name: 'Heritage', bcuPrefix: '162' },
  { code: 'HSBC', name: 'HSBC Uruguay', bcuPrefix: '157' },
];

async function main() {
  const prisma = createSeedPrisma();
  for (const bank of BANKS) {
    await prisma.bank.upsert({
      where: { code: bank.code },
      create: { ...bank, isActive: true },
      update: { name: bank.name, bcuPrefix: bank.bcuPrefix, isActive: true },
    });
  }
  console.log(`Seeded ${BANKS.length} banks`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
