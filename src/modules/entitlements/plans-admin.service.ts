import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { buildProblem } from '@common/errors/problem.factory';
import {
  mergePlanEntitlements,
  parsePlanEntitlements,
} from '@common/types/plan-entitlements.schema';
import { PrismaService } from '@prisma/prisma.service';
import type { AssignSubscriptionPlanDto } from './dto/assign-plan.dto';
import type { CreateCustomPlanDto } from './dto/assign-plan.dto';
import type { UpdatePlanDefinitionDto } from './dto/plan-entitlements.dto';
import { PlanDefinitionRepository } from './plan-definition.repository';
import { PlanEntitlementsCacheService } from './plan-entitlements-cache.service';

@Injectable()
export class PlansAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planDefinitionRepo: PlanDefinitionRepository,
    private readonly planCache: PlanEntitlementsCacheService,
  ) {}

  listCatalog() {
    return this.planDefinitionRepo.findAllCatalog();
  }

  async updateCatalogPlan(id: string, dto: UpdatePlanDefinitionDto) {
    const row = await this.planDefinitionRepo.findById(id);
    if (!row || row.professionalProfileId || row.companyId) {
      throw new NotFoundException(
        buildProblem('NOT_FOUND', 'Plan de catálogo no encontrado.'),
      );
    }
    const entitlements = this.parseEntitlements(dto.entitlements);
    const updated = await this.planDefinitionRepo.updateEntitlements(
      id,
      entitlements,
    );
    this.planCache.invalidate(id);
    return updated;
  }

  async assignProfessionalPlan(
    professionalProfileId: string,
    dto: AssignSubscriptionPlanDto,
  ) {
    const profile = await this.prisma.professionalProfile.findFirst({
      where: { id: professionalProfileId, deletedAt: null },
    });
    if (!profile) {
      throw new NotFoundException(
        buildProblem(
          'PROFESSIONAL_PROFILE_NOT_FOUND',
          'No existe el perfil profesional.',
        ),
      );
    }
    return this.applyPlanAssignment({
      currentPlanDefinitionId: profile.planDefinitionId,
      subscriptionPlan: dto.subscriptionPlan,
      entitlements: dto.entitlements,
      link: { professionalProfileId },
    });
  }

  async assignCompanyPlan(companyId: string, dto: AssignSubscriptionPlanDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException(
        buildProblem('NOT_FOUND', 'No existe la empresa.'),
      );
    }
    return this.applyPlanAssignment({
      currentPlanDefinitionId: company.planDefinitionId,
      subscriptionPlan: dto.subscriptionPlan,
      entitlements: dto.entitlements,
      link: { companyId },
    });
  }

  async createProfessionalCustomPlan(
    professionalProfileId: string,
    dto: CreateCustomPlanDto,
  ) {
    const entitlements = this.parseEntitlements(dto.entitlements);
    const custom = await this.planDefinitionRepo.createCustomForProfessional({
      professionalProfileId,
      entitlements,
    });
    await this.prisma.professionalProfile.update({
      where: { id: professionalProfileId },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: custom.id,
      },
    });
    this.planCache.invalidate(custom.id);
    return custom;
  }

  async createCompanyCustomPlan(companyId: string, dto: CreateCustomPlanDto) {
    const entitlements = this.parseEntitlements(dto.entitlements);
    const custom = await this.planDefinitionRepo.createCustomForCompany({
      companyId,
      entitlements,
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionPlan: SubscriptionPlan.CUSTOM,
        planDefinitionId: custom.id,
      },
    });
    this.planCache.invalidate(custom.id);
    return custom;
  }

  private async applyPlanAssignment(input: {
    currentPlanDefinitionId: string;
    subscriptionPlan: SubscriptionPlan;
    entitlements?: CreateCustomPlanDto['entitlements'];
    link: { professionalProfileId: string } | { companyId: string };
  }) {
    if (input.subscriptionPlan === SubscriptionPlan.CUSTOM) {
      if (!input.entitlements) {
        throw new BadRequestException(
          buildProblem(
            'PLAN_ENTITLEMENTS_REQUIRED',
            'Indicá entitlements para un plan CUSTOM.',
          ),
        );
      }
      const parsed = this.parseEntitlements(input.entitlements);
      const custom =
        'professionalProfileId' in input.link
          ? await this.planDefinitionRepo.createCustomForProfessional({
              professionalProfileId: input.link.professionalProfileId,
              entitlements: parsed,
            })
          : await this.planDefinitionRepo.createCustomForCompany({
              companyId: input.link.companyId,
              entitlements: parsed,
            });

      await this.deactivateIfCustom(input.currentPlanDefinitionId);

      if ('professionalProfileId' in input.link) {
        await this.prisma.professionalProfile.update({
          where: { id: input.link.professionalProfileId },
          data: {
            subscriptionPlan: SubscriptionPlan.CUSTOM,
            planDefinitionId: custom.id,
          },
        });
      } else {
        await this.prisma.company.update({
          where: { id: input.link.companyId },
          data: {
            subscriptionPlan: SubscriptionPlan.CUSTOM,
            planDefinitionId: custom.id,
          },
        });
      }
      this.planCache.invalidate(custom.id);
      this.planCache.invalidate(input.currentPlanDefinitionId);
      return custom;
    }

    const catalogCode = input.subscriptionPlan as Exclude<
      SubscriptionPlan,
      'CUSTOM'
    >;
    const catalogId = this.planDefinitionRepo.findCatalogIdByCode(catalogCode);
    await this.deactivateIfCustom(input.currentPlanDefinitionId);
    this.planCache.invalidate(catalogId);
    this.planCache.invalidate(input.currentPlanDefinitionId);

    if ('professionalProfileId' in input.link) {
      await this.prisma.professionalProfile.update({
        where: { id: input.link.professionalProfileId },
        data: {
          subscriptionPlan: input.subscriptionPlan,
          planDefinitionId: catalogId,
        },
      });
    } else {
      await this.prisma.company.update({
        where: { id: input.link.companyId },
        data: {
          subscriptionPlan: input.subscriptionPlan,
          planDefinitionId: catalogId,
        },
      });
    }
    return this.planDefinitionRepo.findById(catalogId);
  }

  private async deactivateIfCustom(planDefinitionId: string): Promise<void> {
    const current = await this.planDefinitionRepo.findById(planDefinitionId);
    if (current?.code === SubscriptionPlan.CUSTOM) {
      await this.planDefinitionRepo.deactivate(planDefinitionId);
    }
  }

  private parseEntitlements(raw: unknown): ReturnType<typeof mergePlanEntitlements> {
    try {
      return mergePlanEntitlements(parsePlanEntitlements(raw));
    } catch {
      throw new BadRequestException(
        buildProblem(
          'PLAN_ENTITLEMENTS_INVALID',
          'Los parámetros del plan no son válidos.',
        ),
      );
    }
  }
}
