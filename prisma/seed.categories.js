/**
 * Catálogo de oficios (TRADE) y servicios (SERVICE): upsert por `slug` (idempotente).
 * Fuente: prisma/data/categories.json (generar con `node scripts/build-categories-json.mjs`).
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function loadCatalog() {
  const path = join(__dirname, 'data', 'categories.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedCategories(prisma) {
  const catalog = loadCatalog();

  for (const trade of catalog) {
    const parent = await prisma.category.upsert({
      where: { slug: trade.slug },
      create: {
        name: trade.name,
        slug: trade.slug,
        type: 'TRADE',
        parentId: null,
        supportsUrgency: trade.supportsUrgency ?? false,
      },
      update: {
        name: trade.name,
        type: 'TRADE',
        parentId: null,
        supportsUrgency: trade.supportsUrgency ?? false,
      },
    });

    for (const service of trade.children ?? []) {
      await prisma.category.upsert({
        where: { slug: service.slug },
        create: {
          name: service.name,
          slug: service.slug,
          type: 'SERVICE',
          parentId: parent.id,
          supportsUrgency: service.supportsUrgency ?? false,
        },
        update: {
          name: service.name,
          type: 'SERVICE',
          parentId: parent.id,
          supportsUrgency: service.supportsUrgency ?? false,
        },
      });
    }
  }
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runSeedCategories(prisma);
    const trades = await prisma.category.count({ where: { type: 'TRADE' } });
    const services = await prisma.category.count({ where: { type: 'SERVICE' } });
    console.info(
      `Categories seed applied: ${trades} trades, ${services} services.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Categories seed failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runSeedCategories, loadCatalog };
