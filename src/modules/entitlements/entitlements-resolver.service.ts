import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';
import {
  mergePlanEntitlements,
  PLAN_CATALOG_DEFAULTS,
  type PlanEntitlements,
} from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import { PlanDefinitionRepository } from './plan-definition.repository';
import { PlanEntitlementsCacheService } from './plan-entitlements-cache.service';
import { EntitlementsRequestStore } from './entitlements-request.store';
import type { PlanSubjectType } from './entitlements.types';

@Injectable()
export class EntitlementsResolverService {
  private readonly logger = new Logger(EntitlementsResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planDefinitionRepo: PlanDefinitionRepository,
    private readonly cache: PlanEntitlementsCacheService,
    private readonly requestStore: EntitlementsRequestStore,
  ) {}

  async resolveByPlanDefinitionId(
    planDefinitionId: string,
  ): Promise<PlanEntitlements> {
    const memo = this.requestStore.getForPlanId(planDefinitionId);
    if (memo) {
      return memo;
    }

    const def = await this.planDefinitionRepo.findById(planDefinitionId);
    if (!def) {
      const fallback = { ...PLAN_CATALOG_DEFAULTS.FREE };
      return fallback;
    }

    const cached = this.cache.get(planDefinitionId, def.version);
    if (cached) {
      this.requestStore.setForPlanId(planDefinitionId, cached);
      return cached;
    }

    const entitlements = mergePlanEntitlements(def.entitlements);
    this.cache.set(planDefinitionId, def.version, entitlements);
    this.requestStore.setForPlanId(planDefinitionId, entitlements);
    return entitlements;
  }

  async resolveForSubject(
    subjectType: PlanSubjectType,
    subjectId: string,
  ): Promise<PlanEntitlements> {
    const memo = this.requestStore.getForSubject(subjectType, subjectId);
    if (memo) {
      return memo;
    }

    const planDefinitionId = await this.loadPlanDefinitionId(
      subjectType,
      subjectId,
    );
    const entitlements = await this.resolveByPlanDefinitionId(planDefinitionId);
    this.requestStore.setForSubject(subjectType, subjectId, entitlements);
    return entitlements;
  }

  private async loadPlanDefinitionId(
    subjectType: PlanSubjectType,
    subjectId: string,
  ): Promise<string> {
    if (subjectType === 'professional') {
      const profile = await this.prisma.professionalProfile.findFirst({
        where: { id: subjectId, deletedAt: null },
        select: {
          planDefinitionId: true,
          subscriptionPlan: true,
          planDefinition: { select: { code: true } },
        },
      });
      if (!profile) {
        throw new NotFoundException(
          buildProblem(
            'PROFESSIONAL_PROFILE_NOT_FOUND',
            'No existe el perfil profesional.',
          ),
        );
      }
      if (profile.planDefinition?.code !== profile.subscriptionPlan) {
        this.logger.warn({
          op: 'entitlements.planDrift',
          subjectType,
          subjectId,
          subscriptionPlan: profile.subscriptionPlan,
          planCode: profile.planDefinition?.code,
        });
      }
      return profile.planDefinitionId;
    }

    const company = await this.prisma.company.findFirst({
      where: { id: subjectId, deletedAt: null },
      select: {
        planDefinitionId: true,
        subscriptionPlan: true,
        planDefinition: { select: { code: true } },
      },
    });
    if (!company) {
      throw new NotFoundException(
        buildProblem('NOT_FOUND', 'No existe la empresa.'),
      );
    }
    if (company.planDefinition?.code !== company.subscriptionPlan) {
      this.logger.warn({
        op: 'entitlements.planDrift',
        subjectType,
        subjectId,
        subscriptionPlan: company.subscriptionPlan,
        planCode: company.planDefinition?.code,
      });
    }
    return company.planDefinitionId;
  }
}
