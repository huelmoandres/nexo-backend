/**
 * Volumen opcional de profesionales (Montevideo, bbox acotada, PostGIS, geo coherente).
 * Opt-in: `STRESS_PRO_COUNT>0` y/o `SEED_STRESS=1` (ver `seed.js`).
 *
 * Tablas: `User`, `ProfessionalProfile`, `ProfessionalCategory`, PostGIS,
 * `ProfessionalIdentity`, `TrustProfile`. Idempotencia por email `stress-pro-{n}@nexos.seed.local`.
 */

const { randomUUID } = require('node:crypto');
const { faker } = require('@faker-js/faker');

/** Montevideo — bbox acotado para demos geoespaciales */
const BBOX = { lonMin: -56.35, lonMax: -56.05, latMin: -34.95, latMax: -34.85 };

/**
 * @returns {number}
 */
function resolveStressCount() {
  const raw = Number(process.env.STRESS_PRO_COUNT ?? '0');
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), 5000);
  }
  if (process.env.SEED_STRESS === '1') {
    return 50;
  }
  return 0;
}

function configureFaker() {
  if (process.env.SEED_RANDOM === '1') {
    return;
  }
  faker.seed(Number(process.env.SEED_FAKER_SEED ?? '987654321'));
}

function randomPointInBbox() {
  return {
    longitude: faker.number.float({
      min: BBOX.lonMin,
      max: BBOX.lonMax,
      fractionDigits: 7,
    }),
    latitude: faker.number.float({
      min: BBOX.latMin,
      max: BBOX.latMax,
      fractionDigits: 7,
    }),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function resolveMontevideoStressGeo(prisma) {
  const country = await prisma.country.findUnique({
    where: { isoCode: 'UY' },
    select: { id: true },
  });
  if (!country) {
    throw new Error('Stress seed: falta país UY — ejecutar seed.geo antes.');
  }
  const state = await prisma.state.findFirst({
    where: { countryId: country.id, slug: 'montevideo' },
    select: { id: true },
  });
  if (!state) {
    throw new Error('Stress seed: falta departamento montevideo.');
  }
  const city = await prisma.city.findFirst({
    where: { stateId: state.id, slug: 'montevideo' },
    select: { id: true },
  });
  if (!city) {
    throw new Error('Stress seed: falta ciudad montevideo.');
  }
  const neighborhoods = await prisma.neighborhood.findMany({
    where: { cityId: city.id },
    select: { id: true },
  });
  if (neighborhoods.length === 0) {
    throw new Error('Stress seed: no hay barrios en Montevideo — ejecutar seed.geo antes.');
  }
  return {
    countryId: country.id,
    stateId: state.id,
    cityId: city.id,
    neighborhoodIds: neighborhoods.map((n) => n.id),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedStress(prisma) {
  const total = resolveStressCount();
  if (total === 0) {
    console.info('Stress seed: omitido (STRESS_PRO_COUNT=0 y SEED_STRESS distinto de 1).');
    return;
  }

  configureFaker();

  const geo = await resolveMontevideoStressGeo(prisma);
  const categories = await prisma.category.findMany({
    where: { deletedAt: null, parentId: null },
    select: { id: true },
  });
  if (categories.length === 0) {
    throw new Error('Stress seed: no hay categorías — ejecutar seed.categories antes.');
  }
  const categoryIds = categories.map((c) => c.id);

  const batchTarget = Math.min(Number(process.env.STRESS_BATCH_SIZE || '30') || 30, 200);
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= total; i++) {
    const email = `stress-pro-${String(i).padStart(6, '0')}@nexos.seed.local`;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      skipped++;
      continue;
    }

    const neighborhoodId =
      geo.neighborhoodIds[Math.floor(Math.random() * geo.neighborhoodIds.length)];
    if (!neighborhoodId) {
      throw new Error('Stress seed: vecindario inválido.');
    }
    const { longitude, latitude } = randomPointInBbox();
    const categoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
    if (!categoryId) {
      throw new Error('Stress seed: sin categoría.');
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          supabaseUid: randomUUID(),
          email,
          fullName: `Stress Pro ${i}`,
          role: 'INDEPENDENT_PRO',
        },
      });

      const profile = await tx.professionalProfile.create({
        data: {
          userId: user.id,
          bio: `Perfil de carga stress #${i}`,
          experienceYears: faker.number.int({ min: 0, max: 25 }),
          countryId: geo.countryId,
          stateId: geo.stateId,
          cityId: geo.cityId,
          neighborhoodId,
          kycStatus: 'UNVERIFIED',
          isAvailable: true,
          subscriptionPlan: 'FREE',
          planDefinitionId: 'a0000000-0000-4000-8000-000000000001',
        },
      });

      await tx.professionalCategory.create({
        data: { professionalId: profile.id, categoryId },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO "ServiceArea" (
          "id", "professionalProfileId", "label", "location", "radiusMeters", "isPrimary",
          "countryId", "stateId", "cityId", "neighborhoodId", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $3, 'Principal',
          ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
          5000, true, $4, $5, $6, $7, NOW(), NOW()
        )`,
        longitude,
        latitude,
        profile.id,
        geo.countryId,
        geo.stateId,
        geo.cityId,
        neighborhoodId,
      );

      await tx.professionalIdentity.create({
        data: {
          professionalProfileId: profile.id,
        },
      });

      await tx.trustProfile.create({
        data: {
          subjectType: 'PROFESSIONAL',
          subjectId: profile.id,
          professionalProfileId: profile.id,
        },
      });
    });

    created++;
    if (created % batchTarget === 0) {
      console.info(`Stress seed: creados ${created} (objetivo ${total}, omitidos ${skipped})…`);
    }
  }

  console.info(
    `Stress seed: fin — creados=${created}, ya existían (omitidos)=${skipped}, pedidos=${total}.`,
  );
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runSeedStress(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  process.env.SEED_STRESS = '1';
  main().catch((err) => {
    console.error('Stress seed failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runSeedStress, resolveStressCount };
