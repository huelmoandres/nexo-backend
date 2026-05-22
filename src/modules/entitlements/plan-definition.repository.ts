import { Injectable } from '@nestjs/common';
import { SubscriptionPlan, type PlanDefinition } from '@prisma/client';
import { PrismaService } from '@prisma/prisma.service';
import { CATALOG_PLAN_IDS } from '@common/types/plan-entitlements.schema';

@Injectable()
export class PlanDefinitionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<PlanDefinition | null> {
    return this.prisma.planDefinition.findFirst({
      where: { id, isActive: true },
    });
  }

  findByIdIncludingInactive(id: string): Promise<PlanDefinition | null> {
    return this.prisma.planDefinition.findUnique({
      where: { id },
    });
  }

  findCatalogByCode(
    code: Exclude<SubscriptionPlan, 'CUSTOM'>,
  ): Promise<PlanDefinition | null> {
    return this.prisma.planDefinition.findFirst({
      where: {
        code,
        professionalProfileId: null,
        companyId: null,
        isActive: true,
      },
    });
  }

  findAllCatalog(): Promise<PlanDefinition[]> {
    return this.prisma.planDefinition.findMany({
      where: {
        professionalProfileId: null,
        companyId: null,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    });
  }

  findCatalogIdByCode(code: Exclude<SubscriptionPlan, 'CUSTOM'>): string {
    return CATALOG_PLAN_IDS[code];
  }

  async updateEntitlements(
    id: string,
    entitlements: object,
  ): Promise<PlanDefinition> {
    return this.prisma.planDefinition.update({
      where: { id },
      data: {
        entitlements,
        version: { increment: 1 },
      },
    });
  }

  async createCustomForProfessional(input: {
    professionalProfileId: string;
    entitlements: object;
  }): Promise<PlanDefinition> {
    return this.prisma.planDefinition.create({
      data: {
        code: SubscriptionPlan.CUSTOM,
        entitlements: input.entitlements,
        professionalProfileId: input.professionalProfileId,
      },
    });
  }

  async createCustomForCompany(input: {
    companyId: string;
    entitlements: object;
  }): Promise<PlanDefinition> {
    return this.prisma.planDefinition.create({
      data: {
        code: SubscriptionPlan.CUSTOM,
        entitlements: input.entitlements,
        companyId: input.companyId,
      },
    });
  }

  async deactivate(id: string): Promise<void> {
    const row = await this.findByIdIncludingInactive(id);
    if (!row) {
      return;
    }
    await this.prisma.planDefinition.update({
      where: { id },
      data: {
        isActive: false,
        professionalProfileId: null,
        companyId: null,
      },
    });
  }
}
