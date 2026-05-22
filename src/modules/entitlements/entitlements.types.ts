export type PlanSubjectType = 'professional' | 'company';

export type PlanCapability =
  | 'serviceArea.create'
  | 'serviceArea.radius'
  | 'portfolio.item.create'
  | 'portfolio.photo.add'
  | 'search.queryExpansion'
  | 'urgency.broadcast';

export interface AssertServiceAreaRadiusContext {
  radiusMeters: number;
}

export interface AssertPortfolioItemContext {
  effectiveMax?: number;
}

export interface AssertPortfolioPhotoContext {
  currentPhotoCount: number;
  effectiveMax?: number;
}

export type AssertCapabilityContext =
  | AssertServiceAreaRadiusContext
  | AssertPortfolioItemContext
  | AssertPortfolioPhotoContext;
