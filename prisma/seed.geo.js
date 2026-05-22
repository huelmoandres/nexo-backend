require('dotenv/config');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const LITE_PATH = join(__dirname, 'data/uruguay-geo-lite.json');
const FULL_PATH = join(__dirname, 'data/uruguay-geo.json');

/** Subconjunto mínimo para CI / desarrollo rápido. */
const uruguaySeedLite = {
  country: { name: 'Uruguay', isoCode: 'UY', slug: 'uruguay' },
  states: [
    {
      name: 'Montevideo',
      slug: 'montevideo',
      iso3166_2: 'UY-MO',
      source: 'SEED',
      cities: [
        {
          name: 'Montevideo',
          slug: 'montevideo',
          source: 'SEED',
          neighborhoods: [
            { name: 'Pocitos', slug: 'pocitos', source: 'SEED' },
            { name: 'Cordón', slug: 'cordon', source: 'SEED' },
            { name: 'Centro', slug: 'centro', source: 'SEED' },
          ],
        },
      ],
    },
    {
      name: 'Maldonado',
      slug: 'maldonado',
      iso3166_2: 'UY-MA',
      source: 'SEED',
      cities: [
        {
          name: 'Punta del Este',
          slug: 'punta-del-este',
          source: 'SEED',
          neighborhoods: [
            { name: 'Península', slug: 'peninsula', source: 'SEED' },
            { name: 'Centro', slug: 'centro', source: 'SEED' },
          ],
        },
      ],
    },
    {
      name: 'Canelones',
      slug: 'canelones',
      iso3166_2: 'UY-CA',
      source: 'SEED',
      cities: [
        {
          name: 'Ciudad de la Costa',
          slug: 'ciudad-de-la-costa',
          source: 'SEED',
          neighborhoods: [
            { name: 'El Pinar', slug: 'el-pinar', source: 'SEED' },
            { name: 'Centro', slug: 'centro', source: 'SEED' },
          ],
        },
      ],
    },
  ],
};

function loadUruguaySeed() {
  if (process.env['SEED_GEO_LITE'] === '1') {
    return uruguaySeedLite;
  }
  const path = existsSync(FULL_PATH) ? FULL_PATH : LITE_PATH;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {ReturnType<typeof loadUruguaySeed>} seedData
 */
async function runSeedGeo(prisma, seedData = loadUruguaySeed()) {
  const country = await prisma.country.upsert({
    where: { isoCode: seedData.country.isoCode },
    update: {
      name: seedData.country.name,
      slug: seedData.country.slug,
    },
    create: seedData.country,
  });

  for (const stateSeed of seedData.states) {
    const state = await prisma.state.upsert({
      where: {
        countryId_slug: {
          countryId: country.id,
          slug: stateSeed.slug,
        },
      },
      update: {
        name: stateSeed.name,
        iso3166_2: stateSeed.iso3166_2 ?? null,
        latitude: stateSeed.latitude ?? null,
        longitude: stateSeed.longitude ?? null,
        source: stateSeed.source ?? 'SEED',
        externalId: stateSeed.externalId ?? null,
      },
      create: {
        name: stateSeed.name,
        slug: stateSeed.slug,
        countryId: country.id,
        iso3166_2: stateSeed.iso3166_2 ?? null,
        latitude: stateSeed.latitude ?? null,
        longitude: stateSeed.longitude ?? null,
        source: stateSeed.source ?? 'SEED',
        externalId: stateSeed.externalId ?? null,
      },
    });

    for (const citySeed of stateSeed.cities) {
      const city = await prisma.city.upsert({
        where: {
          stateId_slug: {
            stateId: state.id,
            slug: citySeed.slug,
          },
        },
        update: {
          name: citySeed.name,
          latitude: citySeed.latitude ?? null,
          longitude: citySeed.longitude ?? null,
          source: citySeed.source ?? 'SEED',
          externalId: citySeed.externalId ?? null,
        },
        create: {
          name: citySeed.name,
          slug: citySeed.slug,
          stateId: state.id,
          latitude: citySeed.latitude ?? null,
          longitude: citySeed.longitude ?? null,
          source: citySeed.source ?? 'SEED',
          externalId: citySeed.externalId ?? null,
        },
      });

      for (const neighborhoodSeed of citySeed.neighborhoods) {
        await prisma.neighborhood.upsert({
          where: {
            cityId_slug: {
              cityId: city.id,
              slug: neighborhoodSeed.slug,
            },
          },
          update: {
            name: neighborhoodSeed.name,
            latitude: neighborhoodSeed.latitude ?? null,
            longitude: neighborhoodSeed.longitude ?? null,
            source: neighborhoodSeed.source ?? 'SEED',
            externalId: neighborhoodSeed.externalId ?? null,
          },
          create: {
            name: neighborhoodSeed.name,
            slug: neighborhoodSeed.slug,
            cityId: city.id,
            latitude: neighborhoodSeed.latitude ?? null,
            longitude: neighborhoodSeed.longitude ?? null,
            source: neighborhoodSeed.source ?? 'SEED',
            externalId: neighborhoodSeed.externalId ?? null,
          },
        });
      }
    }
  }
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runSeedGeo(prisma);
    console.info('Geo seed applied successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Geo seed failed:', error);
    process.exitCode = 1;
  });
}

module.exports = { runSeedGeo, loadUruguaySeed, uruguaySeedLite };
