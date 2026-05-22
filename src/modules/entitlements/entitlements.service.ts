import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import type { PlanEntitlements } from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import { EntitlementsAssertService } from './entitlements-assert.service';
import { EntitlementsResolverService } from './entitlements-resolver.service';
import type {
  AssertCapabilityContext,
  PlanCapability,
  PlanSubjectType,
} from './entitlements.types';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: EntitlementsResolverService,
    private readonly assertService: EntitlementsAssertService,
  ) {}

  resolve(input: {
    subscriptionPlan: SubscriptionPlan;
    planDefinitionId: string;
  }): Promise<PlanEntitlements> {
    return this.resolver.resolveByPlanDefinitionId(input.planDefinitionId);
  }

  resolveByPlanDefinitionId(
    planDefinitionId: string,
  ): Promise<PlanEntitlements> {
    return this.resolver.resolveByPlanDefinitionId(planDefinitionId);
  }

  resolveForProfessional(
    professionalProfileId: string,
  ): Promise<PlanEntitlements> {
    return this.resolver.resolveForSubject(
      'professional',
      professionalProfileId,
    );
  }

  resolveForCompany(companyId: string): Promise<PlanEntitlements> {
    return this.resolver.resolveForSubject('company', companyId);
  }

  async assertCompanyAdmin(
    supabaseUid: string,
    companyId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { supabaseUid, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(
        buildProblem('USER_NOT_FOUND', 'Usuario no encontrado.'),
      );
    }
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null, adminId: user.id },
      select: { id: true },
    });
    if (!company) {
      throw new ForbiddenException(
        buildProblem(
          'COMPANY_ACCESS_DENIED',
          'No tenés permiso para administrar esta empresa.',
        ),
      );
    }
  }

  assertCanAddServiceArea(
    subjectType: PlanSubjectType,
    subjectId: string,
  ): Promise<void> {
    return this.assertService.assert(
      'serviceArea.create',
      subjectType,
      subjectId,
    );
  }

  assertRadiusWithinPlan(
    subjectType: PlanSubjectType,
    subjectId: string,
    radiusMeters: number,
  ): Promise<void> {
    return this.assertService.assert(
      'serviceArea.radius',
      subjectType,
      subjectId,
      { radiusMeters },
    );
  }

  assert(
    capability: PlanCapability,
    subjectType: PlanSubjectType,
    subjectId: string,
    context?: AssertCapabilityContext,
  ): Promise<void> {
    return this.assertService.assert(
      capability,
      subjectType,
      subjectId,
      context,
    );
  }

  isSearchQueryExpansionEnabled(entitlements: PlanEntitlements): boolean {
    return this.assertService.isSearchQueryExpansionEnabled(entitlements);
  }
}
