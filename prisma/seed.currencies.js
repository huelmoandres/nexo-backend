/**
 * Seed catálogo UYU/USD y tasa BCU de ejemplo (desarrollo).
 * Ejecutar: node prisma/seed.currencies.js
 */
require('dotenv/config');
const { createSeedPrisma } = require('./lib/seed-prisma.js');

const UYU_ID = 'c0000000-0000-4000-8000-000000000001';
const USD_ID = 'c0000000-0000-4000-8000-000000000002';

/** 39.85 UYU por USD × 1e6 */
const SAMPLE_SELL_MICROS = 39_850_000;
const SAMPLE_BUY_MICROS = 39_500_000;

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedCurrencies(prisma) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.currency.upsert({
    where: { code: 'UYU' },
    create: {
      id: UYU_ID,
      code: 'UYU',
      name: 'Peso uruguayo',
      minorUnits: 2,
      isDefault: true,
      isActive: true,
    },
    update: { isActive: true, isDefault: true },
  });

  await prisma.currency.upsert({
    where: { code: 'USD' },
    create: {
      id: USD_ID,
      code: 'USD',
      name: 'Dólar estadounidense',
      minorUnits: 2,
      bcuMonedaCode: 2225,
      isDefault: false,
      isActive: true,
    },
    update: { isActive: true, bcuMonedaCode: 2225 },
  });

  await prisma.exchangeRate.upsert({
    where: {
      baseCurrencyId_quoteCurrencyId_effectiveDate: {
        baseCurrencyId: UYU_ID,
        quoteCurrencyId: USD_ID,
        effectiveDate: today,
      },
    },
    create: {
      baseCurrencyId: UYU_ID,
      quoteCurrencyId: USD_ID,
      effectiveDate: today,
      buyRateMicros: SAMPLE_BUY_MICROS,
      sellRateMicros: SAMPLE_SELL_MICROS,
      source: 'SEED',
    },
    update: {
      buyRateMicros: SAMPLE_BUY_MICROS,
      sellRateMicros: SAMPLE_SELL_MICROS,
    },
  });

  console.info('Currencies and sample exchange rate seeded.');
}

async function main() {
  const prisma = createSeedPrisma();
  try {
    await runSeedCurrencies(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runSeedCurrencies };
