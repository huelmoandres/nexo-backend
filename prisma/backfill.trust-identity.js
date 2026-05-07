/**
 * Backfill idempotente: crea filas faltantes en ProfessionalIdentity y TrustProfile
 * para datos existentes anteriores a la migración de Fase A.
 *
 * Uso:
 *   npm run db:backfill:trust-identity
 *
 * Producción (requiere confirmación explícita):
 *   ALLOW_TRUST_BACKFILL=1 npm run db:backfill:trust-identity
 *
 * Exporta `runTrustIdentityBackfill(prisma)` para el orquestador `prisma/seed.js`.
 */
require('dotenv/config');

const BATCH = 300;

function assertProductionBackfillAllowed() {
  if (process.env['NODE_ENV'] === 'production' && process.env['ALLOW_TRUST_BACKFILL'] !== '1') {
    throw new Error(
      'Aborted: running against production requires ALLOW_TRUST_BACKFILL=1 in the environment.',
    );
  }
}

/**
 * @param {import('@prisma/client').KycStatus} kycStatus
 * @returns {{ status: import('@prisma/client').TrustStatus; level: import('@prisma/client').VerificationLevel }}
 */
function mapKycToTrust(kycStatus) {
  switch (kycStatus) {
    case 'VERIFIED':
      return { status: 'VERIFIED', level: 'LEVEL_2' };
    case 'PENDING_KYC':
      return { status: 'PENDING', level: 'LEVEL_1' };
    case 'UNVERIFIED':
    default:
      return { status: 'PENDING', level: 'LEVEL_1' };
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function backfillProfessionalIdentity(prisma) {
  let created = 0;
  let skipped = 0;
  let cursor = 0;

  for (;;) {
    const profiles = await prisma.professionalProfile.findMany({
      where: { deletedAt: null },
      select: { id: true },
      skip: cursor,
      take: BATCH,
      orderBy: { id: 'asc' },
    });

    if (profiles.length === 0) {
      break;
    }

    const ids = profiles.map((p) => p.id);
    const existing = await prisma.professionalIdentity.findMany({
      where: { professionalProfileId: { in: ids } },
      select: { professionalProfileId: true },
    });
    const has = new Set(existing.map((e) => e.professionalProfileId));
    const missing = ids.filter((id) => !has.has(id));

    if (missing.length > 0) {
      const result = await prisma.professionalIdentity.createMany({
        data: missing.map((professionalProfileId) => ({ professionalProfileId })),
      });
      created += result.count;
    }
    skipped += ids.length - missing.length;

    cursor += profiles.length;
    if (profiles.length < BATCH) {
      break;
    }
  }

  return { created, skippedExisting: skipped };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function backfillTrustProfessional(prisma) {
  let created = 0;
  let skipped = 0;
  let cursor = 0;

  for (;;) {
    const profiles = await prisma.professionalProfile.findMany({
      where: { deletedAt: null },
      select: { id: true, kycStatus: true },
      skip: cursor,
      take: BATCH,
      orderBy: { id: 'asc' },
    });

    if (profiles.length === 0) {
      break;
    }

    const ids = profiles.map((p) => p.id);
    const existingRows = await prisma.trustProfile.findMany({
      where: {
        subjectType: 'PROFESSIONAL',
        subjectId: { in: ids },
      },
      select: { subjectId: true },
    });
    const has = new Set(existingRows.map((r) => r.subjectId));

    for (const p of profiles) {
      if (has.has(p.id)) {
        skipped++;
        continue;
      }
      const { status, level } = mapKycToTrust(p.kycStatus);
      await prisma.trustProfile.create({
        data: {
          subjectType: 'PROFESSIONAL',
          subjectId: p.id,
          professionalProfileId: p.id,
          status,
          verificationLevel: level,
        },
      });
      created++;
    }

    cursor += profiles.length;
    if (profiles.length < BATCH) {
      break;
    }
  }

  return { created, skippedExisting: skipped };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function backfillTrustCompany(prisma) {
  let created = 0;
  let skipped = 0;
  let cursor = 0;

  for (;;) {
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
      skip: cursor,
      take: BATCH,
      orderBy: { id: 'asc' },
    });

    if (companies.length === 0) {
      break;
    }

    const ids = companies.map((c) => c.id);
    const existingRows = await prisma.trustProfile.findMany({
      where: {
        subjectType: 'COMPANY',
        subjectId: { in: ids },
      },
      select: { subjectId: true },
    });
    const has = new Set(existingRows.map((r) => r.subjectId));

    const toCreate = ids.filter((id) => !has.has(id));
    if (toCreate.length > 0) {
      await prisma.trustProfile.createMany({
        data: toCreate.map((companyId) => ({
          subjectType: 'COMPANY',
          subjectId: companyId,
          companyId,
          status: 'PENDING',
          verificationLevel: 'LEVEL_1',
        })),
      });
      created += toCreate.length;
    }
    skipped += ids.length - toCreate.length;

    cursor += companies.length;
    if (companies.length < BATCH) {
      break;
    }
  }

  return { created, skippedExisting: skipped };
}

/**
 * Perfiles con KYC verificado en el modelo legacy pero TrustProfile distinto de VERIFIED.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function reportKycTrustMismatches(prisma) {
  const verifiedProfiles = await prisma.professionalProfile.findMany({
    where: {
      deletedAt: null,
      kycStatus: 'VERIFIED',
    },
    select: { id: true },
  });
  const ids = verifiedProfiles.map((p) => p.id);
  if (ids.length === 0) {
    return { mismatchCount: 0, sampleIds: [] };
  }

  const trusts = await prisma.trustProfile.findMany({
    where: {
      subjectType: 'PROFESSIONAL',
      subjectId: { in: ids },
    },
    select: { subjectId: true, status: true },
  });
  const bySubject = new Map(trusts.map((t) => [t.subjectId, t.status]));
  const mismatches = [];
  for (const id of ids) {
    const st = bySubject.get(id);
    if (!st || st !== 'VERIFIED') {
      mismatches.push(id);
    }
  }
  return {
    mismatchCount: mismatches.length,
    sampleIds: mismatches.slice(0, 10),
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<number>}
 */
async function reportDuplicateTrustKeys(prisma) {
  const dup = await prisma.$queryRaw`
    SELECT "subjectType", "subjectId", COUNT(*)::int AS c
    FROM "TrustProfile"
    GROUP BY "subjectType", "subjectId"
    HAVING COUNT(*) > 1
  `;
  return Array.isArray(dup) ? dup.length : 0;
}

/**
 * Ejecuta el backfill completo (misma lógica que el CLI).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runTrustIdentityBackfill(prisma) {
  assertProductionBackfillAllowed();

  console.info('Starting backfill: ProfessionalIdentity + TrustProfile…');

  const identity = await backfillProfessionalIdentity(prisma);
  console.info(
    `ProfessionalIdentity: created=${identity.created}, alreadyPresent=${identity.skippedExisting}`,
  );

  const trustPro = await backfillTrustProfessional(prisma);
  console.info(
    `TrustProfile (PROFESSIONAL): created=${trustPro.created}, skipped=${trustPro.skippedExisting}`,
  );

  const trustCo = await backfillTrustCompany(prisma);
  console.info(
    `TrustProfile (COMPANY): created=${trustCo.created}, skipped=${trustCo.skippedExisting}`,
  );

  const dupGroups = await reportDuplicateTrustKeys(prisma);
  console.info(`TrustProfile duplicate (subjectType, subjectId) groups: ${dupGroups}`);

  const mismatch = await reportKycTrustMismatches(prisma);
  console.info(
    `KYC VERIFIED vs TrustProfile.status mismatch count: ${mismatch.mismatchCount}`,
  );
  if (mismatch.sampleIds.length > 0) {
    console.info(`Sample profile ids (max 10): ${mismatch.sampleIds.join(', ')}`);
  }

  console.info('Backfill completed successfully.');
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runTrustIdentityBackfill(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

module.exports = { runTrustIdentityBackfill };
