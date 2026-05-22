import { Injectable } from '@nestjs/common';
import type { PlanEntitlements } from '@common/types/plan-entitlements.schema';
import type { PlanSubjectType } from './entitlements.types';

type SubjectKey = `${PlanSubjectType}:${string}`;

@Injectable()
export class EntitlementsRequestStore {
  private readonly bySubject = new Map<SubjectKey, PlanEntitlements>();
  private readonly byPlanId = new Map<string, PlanEntitlements>();

  getForSubject(
    subjectType: PlanSubjectType,
    subjectId: string,
  ): PlanEntitlements | undefined {
    return this.bySubject.get(`${subjectType}:${subjectId}`);
  }

  setForSubject(
    subjectType: PlanSubjectType,
    subjectId: string,
    entitlements: PlanEntitlements,
  ): void {
    this.bySubject.set(`${subjectType}:${subjectId}`, entitlements);
  }

  getForPlanId(planDefinitionId: string): PlanEntitlements | undefined {
    return this.byPlanId.get(planDefinitionId);
  }

  setForPlanId(
    planDefinitionId: string,
    entitlements: PlanEntitlements,
  ): void {
    this.byPlanId.set(planDefinitionId, entitlements);
  }

  clear(): void {
    this.bySubject.clear();
    this.byPlanId.clear();
  }
}
