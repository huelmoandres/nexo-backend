/**
 * Orquestador de seeds: geo → categorías → demo → stress (opcional) → backfill trust/identity.
 *
 * Variables:
 * - `SEED_DEMO=0` — omite escenarios demo.
 * - `STRESS_PRO_COUNT` — N profesionales de stress (tope 5000); si no hay N>0, `SEED_STRESS=1` usa 50.
 * - `SEED_STRESS=1` — activa capa stress con conteo por defecto si `STRESS_PRO_COUNT` no está definido.
 * - `SEED_SKIP_BACKFILL=1` — no ejecuta backfill trust/identity al final.
 * - `SEED_RANDOM=1` — en stress, Faker no usa semilla fija.
 *
 * Uso:
 *   npm run db:seed
 *   npm run db:seed:stress
 */
require('dotenv/config');

const { createSeedPrisma } = require('./lib/seed-prisma.js');
const { runSeedGeo } = require('./seed.geo.js');
const { runSeedCategories } = require('./seed.categories.js');
const { runSeedDemo } = require('./seed.demo.js');
const { runSeedStress } = require('./seed.stress.js');
const { runTrustIdentityBackfill } = require('./backfill.trust-identity.js');

async function main() {
  const prisma = createSeedPrisma();
  try {
    console.info('[seed] Capa 1 — geo…');
    await runSeedGeo(prisma);

    console.info('[seed] Capa 1 — categorías…');
    await runSeedCategories(prisma);

    if (process.env.SEED_DEMO !== '0') {
      console.info('[seed] Capa 2 — demo…');
      await runSeedDemo(prisma);
    } else {
      console.info('[seed] Demo omitido (SEED_DEMO=0).');
    }

    console.info('[seed] Capa 3 — stress (opcional)…');
    await runSeedStress(prisma);

    if (process.env.SEED_SKIP_BACKFILL !== '1') {
      console.info('[seed] Post — trust / identity backfill…');
      await runTrustIdentityBackfill(prisma);
    } else {
      console.info('[seed] Backfill omitido (SEED_SKIP_BACKFILL=1).');
    }

    console.info('[seed] Completado.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] Falló:', err);
    process.exit(1);
  });
}

module.exports = { main };
