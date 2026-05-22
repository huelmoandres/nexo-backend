/**
 * Escenarios demo (usuarios, perfil profesional con PostGIS, empresa opcional).
 * Claves estables documentadas (email / supabaseUid) — re-ejecución idempotente por búsqueda.
 *
 * Tablas (orden): `User`, `ProfessionalProfile` + `ProfessionalCategory`, PostGIS UPDATE,
 * `ProfessionalIdentity`, `TrustProfile`; `Company`, `AuditLog`, `TrustProfile` (empresa).
 * Requiere geo + categorías ya sembrados (`seed.geo.js`, `seed.categories.js`).
 *
 * Coordenadas: Montevideo — barrio Pocitos (WGS84), acorde al catálogo `montevideo` / `pocitos`.
 */

/** RUT válido DGI (documentación API). */
const DEMO_COMPANY_RUT = '214567890013';

/** Cuenta de cobro MP para E2E Postman / accept job (22 dígitos CVU válido). */
const DEMO_PRO_PAYOUT_LABEL = 'Demo cobro MP';
const DEMO_PRO_PAYOUT_CVU = '1234567890123456789012';

const DEMO = {
  client: {
    email: 'demo.client@nexos.local',
    supabaseUid: '00000000-0000-4000-8000-000000000001',
    fullName: 'Cliente Demo Nexos',
    role: 'CLIENT',
  },
  pro: {
    email: 'demo.pro@nexos.local',
    supabaseUid: '00000000-0000-4000-8000-000000000002',
    fullName: 'Profesional Demo Nexos',
    role: 'INDEPENDENT_PRO',
    /** Pocitos — bbox Montevideo */
    longitude: -56.136,
    latitude: -34.907,
    bio: 'Profesional de demostración — plomería y electricidad residencial.',
    experienceYears: 8,
    categorySlugs: ['plomeria', 'electricidad'],
  },
  companyAdmin: {
    email: 'demo.company@nexos.local',
    supabaseUid: '00000000-0000-4000-8000-000000000003',
    fullName: 'Admin Empresa Demo Nexos',
    role: 'COMPANY_ADMIN',
    companyName: 'Empresa Demo Nexos S.A.',
  },
};

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function resolveMontevideoPocitos(prisma) {
  const country = await prisma.country.findUnique({
    where: { isoCode: 'UY' },
    select: { id: true },
  });
  if (!country) {
    throw new Error('Demo seed: falta país UY — ejecutar seed.geo antes.');
  }
  const state = await prisma.state.findFirst({
    where: { countryId: country.id, slug: 'montevideo' },
    select: { id: true },
  });
  if (!state) {
    throw new Error('Demo seed: falta departamento montevideo — ejecutar seed.geo antes.');
  }
  const city = await prisma.city.findFirst({
    where: { stateId: state.id, slug: 'montevideo' },
    select: { id: true },
  });
  if (!city) {
    throw new Error('Demo seed: falta Montevideo en catálogo — ejecutar seed.geo antes.');
  }
  const neighborhood = await prisma.neighborhood.findFirst({
    where: { cityId: city.id, slug: 'pocitos' },
    select: { id: true },
  });
  if (!neighborhood) {
    throw new Error('Demo seed: falta barrio pocitos — ejecutar seed.geo antes.');
  }
  return {
    countryId: country.id,
    stateId: state.id,
    cityId: city.id,
    neighborhoodId: neighborhood.id,
  };
}

/**
 * Crea perfil como `UsersRepository.createProfessionalProfileWithPostgis` + KYC/trust alineados.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureDemoProfessional(prisma, geoIds, categoryIds) {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO.pro.email },
    include: { professionalProfile: true },
  });
  if (existing?.professionalProfile) {
    console.info('Demo: profesional ya existe, omitiendo.');
    return;
  }

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        supabaseUid: DEMO.pro.supabaseUid,
        email: DEMO.pro.email,
        fullName: DEMO.pro.fullName,
        role: DEMO.pro.role,
      },
    }));

  await prisma.$transaction(async (tx) => {
    const profile = await tx.professionalProfile.create({
      data: {
        userId: user.id,
        bio: DEMO.pro.bio,
        experienceYears: DEMO.pro.experienceYears,
        countryId: geoIds.countryId,
        stateId: geoIds.stateId,
        cityId: geoIds.cityId,
        neighborhoodId: geoIds.neighborhoodId,
        kycStatus: 'VERIFIED',
        isAvailable: true,
        categories: {
          create: categoryIds.map((categoryId) => ({
            category: { connect: { id: categoryId } },
          })),
        },
      },
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
      DEMO.pro.longitude,
      DEMO.pro.latitude,
      profile.id,
      geoIds.countryId,
      geoIds.stateId,
      geoIds.cityId,
      geoIds.neighborhoodId,
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
        status: 'VERIFIED',
        verificationLevel: 'LEVEL_2',
        verifiedAt: new Date(),
      },
    });
  });
}

/**
 * Cuenta primary MERCADO_PAGO para demo.pro (idempotente por label).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureDemoProPayoutAccount(prisma) {
  const user = await prisma.user.findUnique({
    where: { email: DEMO.pro.email },
    include: { professionalProfile: true },
  });
  if (!user?.professionalProfile) {
    console.info('Demo: sin perfil PRO, omitiendo cuenta de cobro.');
    return;
  }
  const profileId = user.professionalProfile.id;
  const existing = await prisma.payoutAccount.findFirst({
    where: {
      professionalProfileId: profileId,
      label: DEMO_PRO_PAYOUT_LABEL,
    },
  });
  if (existing) {
    if (!existing.isPrimary || !existing.isActive) {
      await prisma.$transaction(async (tx) => {
        await tx.payoutAccount.updateMany({
          where: { professionalProfileId: profileId, isPrimary: true },
          data: { isPrimary: false },
        });
        await tx.payoutAccount.update({
          where: { id: existing.id },
          data: { isPrimary: true, isActive: true },
        });
      });
    }
    console.info('Demo: cuenta de cobro PRO ya existe.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.payoutAccount.updateMany({
      where: { professionalProfileId: profileId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.payoutAccount.create({
      data: {
        subjectType: 'PROFESSIONAL',
        professionalProfileId: profileId,
        method: 'MERCADO_PAGO',
        identifierType: 'MP_CVU',
        label: DEMO_PRO_PAYOUT_LABEL,
        transferIdentifier: DEMO_PRO_PAYOUT_CVU,
        accountHolderName: DEMO.pro.fullName,
        isPrimary: true,
        isActive: true,
      },
    });
  });
  console.info('Demo: cuenta de cobro MP (primary) creada para profesional demo.');
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureDemoClient(prisma) {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO.client.email },
  });
  if (existing) {
    console.info('Demo: cliente ya existe, omitiendo.');
    return;
  }
  await prisma.user.create({
    data: {
      supabaseUid: DEMO.client.supabaseUid,
      email: DEMO.client.email,
      fullName: DEMO.client.fullName,
      role: DEMO.client.role,
    },
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function ensureDemoCompany(prisma, geoIds) {
  const existingCompany = await prisma.company.findFirst({
    where: { rut: DEMO_COMPANY_RUT, deletedAt: null },
  });
  if (existingCompany) {
    console.info('Demo: empresa con RUT demo ya existe, omitiendo alta de empresa.');
    return;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO.companyAdmin.email },
  });
  const adminUser =
    existingUser ??
    (await prisma.user.create({
      data: {
        supabaseUid: DEMO.companyAdmin.supabaseUid,
        email: DEMO.companyAdmin.email,
        fullName: DEMO.companyAdmin.fullName,
        role: DEMO.companyAdmin.role,
      },
    }));

  const haveCompany = await prisma.company.findFirst({
    where: { adminId: adminUser.id, deletedAt: null },
  });
  if (haveCompany) {
    console.info('Demo: usuario company admin ya tiene empresa, omitiendo.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: DEMO.companyAdmin.companyName,
        rut: DEMO_COMPANY_RUT,
        adminId: adminUser.id,
        billingCountryId: geoIds.countryId,
        billingStateId: geoIds.stateId,
        billingCityId: geoIds.cityId,
        billingNeighborhoodId: geoIds.neighborhoodId,
        billingAddressLine: 'Demo — Av. Brasil 1234',
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        companyId: company.id,
        action: 'COMPANY_CREATED',
        entityType: 'Company',
        entityId: company.id,
        metadata: {
          name: DEMO.companyAdmin.companyName,
          rut: DEMO_COMPANY_RUT,
        },
      },
    });

    await tx.trustProfile.create({
      data: {
        subjectType: 'COMPANY',
        subjectId: company.id,
        companyId: company.id,
      },
    });
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedDemo(prisma) {
  const geoIds = await resolveMontevideoPocitos(prisma);

  const categories = await prisma.category.findMany({
    where: { slug: { in: DEMO.pro.categorySlugs }, deletedAt: null },
    select: { id: true, slug: true },
  });
  if (categories.length !== DEMO.pro.categorySlugs.length) {
    const have = new Set(categories.map((c) => c.slug));
    const missing = DEMO.pro.categorySlugs.filter((s) => !have.has(s));
    throw new Error(
      `Demo seed: faltan categorías ${missing.join(', ')} — ejecutar seed.categories antes.`,
    );
  }
  const categoryIds = categories.map((c) => c.id);

  await ensureDemoClient(prisma);
  await ensureDemoProfessional(prisma, geoIds, categoryIds);
  await ensureDemoProPayoutAccount(prisma);
  await ensureDemoCompany(prisma, geoIds);
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runSeedDemo(prisma);
    console.info('Demo seed applied successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Demo seed failed:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  runSeedDemo,
  DEMO,
  DEMO_COMPANY_RUT,
  DEMO_PRO_PAYOUT_LABEL,
  DEMO_PRO_PAYOUT_CVU,
};
