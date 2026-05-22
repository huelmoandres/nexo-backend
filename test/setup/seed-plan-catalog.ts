import { Prisma, PrismaClient, SubscriptionPlan } from '@prisma/client';
import {
  CATALOG_PLAN_IDS,
  PLAN_CATALOG_DEFAULTS,
} from '@common/types/plan-entitlements.schema';

/** Reinserta las 3 filas de catálogo tras truncate en e2e. */
export async function seedPlanCatalog(prisma: PrismaClient): Promise<void> {
  const rows = [
    {
      id: CATALOG_PLAN_IDS.FREE,
      code: SubscriptionPlan.FREE,
      entitlements: PLAN_CATALOG_DEFAULTS.FREE,
    },
    {
      id: CATALOG_PLAN_IDS.PRO,
      code: SubscriptionPlan.PRO,
      entitlements: PLAN_CATALOG_DEFAULTS.PRO,
    },
    {
      id: CATALOG_PLAN_IDS.BUSINESS,
      code: SubscriptionPlan.BUSINESS,
      entitlements: PLAN_CATALOG_DEFAULTS.BUSINESS,
    },
  ] as const;

  const now = new Date();
  for (const row of rows) {
    await prisma.planDefinition.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        code: row.code,
        entitlements: row.entitlements as unknown as Prisma.InputJsonValue,
        updatedAt: now,
      },
      update: {
        code: row.code,
        entitlements: row.entitlements as unknown as Prisma.InputJsonValue,
        isActive: true,
        professionalProfileId: null,
        companyId: null,
        updatedAt: now,
      },
    });
  }
}
