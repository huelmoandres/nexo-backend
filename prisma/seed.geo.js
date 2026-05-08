require('dotenv/config');

const uruguaySeed = {
  country: {
    name: 'Uruguay',
    isoCode: 'UY',
    slug: 'uruguay',
  },
  states: [
    {
      name: 'Montevideo',
      slug: 'montevideo',
      cities: [
        {
          name: 'Montevideo',
          slug: 'montevideo',
          neighborhoods: [
            { name: 'Pocitos', slug: 'pocitos' },
            { name: 'Cordon', slug: 'cordon' },
            { name: 'Centro', slug: 'centro' },
          ],
        },
      ],
    },
    {
      name: 'Maldonado',
      slug: 'maldonado',
      cities: [
        {
          name: 'Punta del Este',
          slug: 'punta-del-este',
          neighborhoods: [
            { name: 'Peninsula', slug: 'peninsula' },
            { name: 'San Rafael', slug: 'san-rafael' },
          ],
        },
        {
          name: 'Maldonado',
          slug: 'maldonado',
          neighborhoods: [{ name: 'Centro', slug: 'centro' }],
        },
      ],
    },
    {
      name: 'Canelones',
      slug: 'canelones',
      cities: [
        {
          name: 'Ciudad de la Costa',
          slug: 'ciudad-de-la-costa',
          neighborhoods: [
            { name: 'El Pinar', slug: 'el-pinar' },
            { name: 'Solymar', slug: 'solymar' },
          ],
        },
      ],
    },
  ],
};

/**
 * Seed geográfico base para dropdowns dependientes y pruebas de integración.
 * Usa upsert para ser idempotente y seguro en múltiples ejecuciones.
 *
 * Tablas: `Country`, `State`, `City`, `Neighborhood`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedGeo(prisma) {
  const country = await prisma.country.upsert({
    where: { isoCode: uruguaySeed.country.isoCode },
    update: {
      name: uruguaySeed.country.name,
      slug: uruguaySeed.country.slug,
    },
    create: uruguaySeed.country,
  });

  for (const stateSeed of uruguaySeed.states) {
    const state = await prisma.state.upsert({
      where: {
        countryId_slug: {
          countryId: country.id,
          slug: stateSeed.slug,
        },
      },
      update: {
        name: stateSeed.name,
      },
      create: {
        name: stateSeed.name,
        slug: stateSeed.slug,
        countryId: country.id,
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
        },
        create: {
          name: citySeed.name,
          slug: citySeed.slug,
          stateId: state.id,
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
          },
          create: {
            name: neighborhoodSeed.name,
            slug: neighborhoodSeed.slug,
            cityId: city.id,
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

module.exports = { runSeedGeo, uruguaySeed };
