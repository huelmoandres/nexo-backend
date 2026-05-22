import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';
import { PrismaService } from '@prisma/prisma.service';
import { EntitlementsResolverService } from './entitlements-resolver.service';
import type {
  AssertCapabilityContext,
  AssertPortfolioItemContext,
  AssertPortfolioPhotoContext,
  AssertServiceAreaRadiusContext,
  PlanCapability,
  PlanSubjectType,
} from './entitlements.types';

@Injectable()
export class EntitlementsAssertService {
  constructor(
    private readonly resolver: EntitlementsResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async assert(
    capability: PlanCapability,
    subjectType: PlanSubjectType,
    subjectId: string,
    context?: AssertCapabilityContext,
  ): Promise<void> {
    const entitlements = await this.resolver.resolveForSubject(
      subjectType,
      subjectId,
    );

    switch (capability) {
      case 'serviceArea.create':
        return this.assertServiceAreaCreate(
          subjectType,
          subjectId,
          entitlements.serviceAreas.max,
        );
      case 'serviceArea.radius': {
        const ctx = context as AssertServiceAreaRadiusContext | undefined;
        if (ctx?.radiusMeters === undefined) {
          throw new BadRequestException(
            buildProblem(
              'VALIDATION_ERROR',
              'Falta radiusMeters en el contexto.',
            ),
          );
        }
        return this.assertServiceAreaRadius(
          entitlements.serviceAreas.radiusMetersMax,
          ctx.radiusMeters,
        );
      }
      case 'portfolio.item.create': {
        const ctx = context as AssertPortfolioItemContext | undefined;
        const max = ctx?.effectiveMax ?? entitlements.portfolio.itemsMax;
        return this.assertPortfolioItemCreate(subjectId, max);
      }
      case 'portfolio.photo.add': {
        const ctx = context as AssertPortfolioPhotoContext | undefined;
        if (ctx?.currentPhotoCount === undefined) {
          throw new BadRequestException(
            buildProblem(
              'VALIDATION_ERROR',
              'Falta currentPhotoCount en el contexto.',
            ),
          );
        }
        const max = ctx.effectiveMax ?? entitlements.portfolio.photosPerItemMax;
        return this.assertPortfolioPhotoAdd(ctx.currentPhotoCount, max);
      }
      case 'search.queryExpansion':
      case 'urgency.broadcast':
        return;
      default: {
        const _exhaustive: never = capability;
        return _exhaustive;
      }
    }
  }

  isSearchQueryExpansionEnabled(entitlements: {
    search: { queryExpansionEnabled: boolean };
  }): boolean {
    return entitlements.search.queryExpansionEnabled;
  }

  private async assertServiceAreaCreate(
    subjectType: PlanSubjectType,
    subjectId: string,
    max: number | null,
  ): Promise<void> {
    if (max === null) {
      return;
    }
    const count = await this.countServiceAreas(subjectType, subjectId);
    if (count >= max) {
      throw new ForbiddenException(
        buildProblem(
          'SERVICE_AREA_LIMIT_REACHED',
          'Alcanzaste el límite de zonas de servicio de tu plan.',
        ),
      );
    }
  }

  private assertServiceAreaRadius(
    maxRadius: number,
    radiusMeters: number,
  ): void {
    if (radiusMeters > maxRadius) {
      throw new BadRequestException(
        buildProblem(
          'PLAN_FEATURE_UNAVAILABLE',
          `El radio máximo permitido por tu plan es ${maxRadius} metros.`,
        ),
      );
    }
  }

  private async assertPortfolioItemCreate(
    professionalProfileId: string,
    itemsMax: number,
  ): Promise<void> {
    const count = await this.prisma.portfolioItem.count({
      where: {
        professionalId: professionalProfileId,
        deletedAt: null,
      },
    });

    if (count >= itemsMax) {
      throw new ForbiddenException(
        buildProblem(
          'PLAN_FEATURE_UNAVAILABLE',
          `Alcanzaste el límite de ${itemsMax} ítems de portfolio de tu plan.`,
        ),
      );
    }
  }

  private assertPortfolioPhotoAdd(
    currentPhotoCount: number,
    photosPerItemMax: number,
  ): void {
    if (currentPhotoCount >= photosPerItemMax) {
      throw new ForbiddenException(
        buildProblem(
          'PLAN_FEATURE_UNAVAILABLE',
          `Máximo ${photosPerItemMax} fotos por ítem según tu plan.`,
        ),
      );
    }
  }

  private async countServiceAreas(
    subjectType: PlanSubjectType,
    subjectId: string,
  ): Promise<number> {
    if (subjectType === 'professional') {
      return this.prisma.serviceArea.count({
        where: { professionalProfileId: subjectId },
      });
    }
    return this.prisma.serviceArea.count({
      where: { companyId: subjectId },
    });
  }
}
