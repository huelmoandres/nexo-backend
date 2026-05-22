import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { plansConfig } from '@config/plans.config';
import type { PlanEntitlements } from '@common/types/plan-entitlements.schema';

interface CacheEntry {
  entitlements: PlanEntitlements;
  version: number;
  expiresAt: number;
}

@Injectable()
export class PlanEntitlementsCacheService {
  private readonly store = new Map<string, CacheEntry>();

  constructor(
    @Inject(plansConfig.KEY)
    private readonly config: ConfigType<typeof plansConfig>,
  ) {}

  get(planDefinitionId: string, version: number): PlanEntitlements | null {
    const entry = this.store.get(planDefinitionId);
    if (!entry) {
      return null;
    }
    if (entry.version !== version || Date.now() > entry.expiresAt) {
      this.store.delete(planDefinitionId);
      return null;
    }
    return entry.entitlements;
  }

  set(
    planDefinitionId: string,
    version: number,
    entitlements: PlanEntitlements,
  ): void {
    this.store.set(planDefinitionId, {
      entitlements,
      version,
      expiresAt: Date.now() + this.config.catalogPlanCacheTtlMs,
    });
  }

  invalidate(planDefinitionId: string): void {
    this.store.delete(planDefinitionId);
  }

  clear(): void {
    this.store.clear();
  }
}
