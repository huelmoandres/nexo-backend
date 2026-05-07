/**
 * Catálogo `Category`: upsert por `slug` (idempotente).
 * Orden: padres antes que hijos para resolver `parentId`.
 * Tabla: `Category`.
 *
 * Alineado con el módulo de categorías (slug único, jerarquía opcional, `supportsUrgency`).
 */
const categoriesInOrder = [
  {
    name: 'Electricidad',
    slug: 'electricidad',
    parentSlug: null,
    supportsUrgency: false,
  },
  {
    name: 'Electricidad de urgencia',
    slug: 'electricidad-urgencias',
    parentSlug: 'electricidad',
    supportsUrgency: true,
  },
  {
    name: 'Plomería',
    slug: 'plomeria',
    parentSlug: null,
    supportsUrgency: false,
  },
  {
    name: 'Gasista',
    slug: 'gasista',
    parentSlug: null,
    supportsUrgency: false,
  },
  {
    name: 'Pintura',
    slug: 'pintura',
    parentSlug: null,
    supportsUrgency: false,
  },
  {
    name: 'Jardinería',
    slug: 'jardineria',
    parentSlug: null,
    supportsUrgency: false,
  },
];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runSeedCategories(prisma) {
  for (const row of categoriesInOrder) {
    let parentId = null;
    if (row.parentSlug) {
      const parent = await prisma.category.findUnique({
        where: { slug: row.parentSlug },
        select: { id: true },
      });
      if (!parent) {
        throw new Error(
          `Categories seed: falta categoría padre con slug "${row.parentSlug}" antes de "${row.slug}"`,
        );
      }
      parentId = parent.id;
    }
    await prisma.category.upsert({
      where: { slug: row.slug },
      create: {
        name: row.name,
        slug: row.slug,
        parentId,
        supportsUrgency: row.supportsUrgency,
      },
      update: {
        name: row.name,
        parentId,
        supportsUrgency: row.supportsUrgency,
      },
    });
  }
}

async function main() {
  const { createSeedPrisma } = require('./lib/seed-prisma.js');
  const prisma = createSeedPrisma();
  try {
    await runSeedCategories(prisma);
    console.info('Categories seed applied successfully.');
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

module.exports = { runSeedCategories, categoriesInOrder };
