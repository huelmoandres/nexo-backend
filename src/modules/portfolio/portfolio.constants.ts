/**
 * Constantes del módulo `portfolio`. Centraliza slugs de problem-detail y
 * códigos de error usados en el flujo del CRUD owner.
 */

/** Códigos de error RFC 7807 expuestos por el módulo. */
export const PORTFOLIO_ERROR_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  PROFESSIONAL_PROFILE_NOT_FOUND: 'PROFESSIONAL_PROFILE_NOT_FOUND',
  ITEM_NOT_FOUND: 'PORTFOLIO_ITEM_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'PORTFOLIO_CATEGORY_NOT_FOUND',
  JOB_NOT_FOUND: 'PORTFOLIO_JOB_NOT_FOUND',
  JOB_NOT_CLOSED: 'PORTFOLIO_JOB_NOT_CLOSED',
  JOB_NOT_OWNED: 'PORTFOLIO_JOB_NOT_OWNED',
  CATEGORY_MISMATCH_JOB: 'PORTFOLIO_CATEGORY_MISMATCH_JOB',
  NOT_OWNER: 'PORTFOLIO_NOT_OWNER',
  FILEKEY_DUPLICATE: 'PORTFOLIO_FILEKEY_DUPLICATE',
  PHOTOS_LIMIT_REACHED: 'PORTFOLIO_PHOTOS_LIMIT_REACHED',
  CATEGORY_FROZEN_POST_VERIFICATION:
    'PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION',
} as const;

/** Slugs URL para `ProblemDetailTypeService`. */
export const PORTFOLIO_PROBLEM_SLUGS = {
  PROFESSIONAL_PROFILE_NOT_FOUND: 'professional-profile-not-found',
  ITEM_NOT_FOUND: 'portfolio-item-not-found',
  CATEGORY_NOT_FOUND: 'portfolio-category-not-found',
  JOB_NOT_FOUND: 'portfolio-job-not-found',
  JOB_NOT_CLOSED: 'portfolio-job-not-closed',
  JOB_NOT_OWNED: 'portfolio-job-not-owned',
  CATEGORY_MISMATCH_JOB: 'portfolio-category-mismatch-job',
  NOT_OWNER: 'portfolio-not-owner',
  FILEKEY_DUPLICATE: 'portfolio-filekey-duplicate',
  PHOTOS_LIMIT_REACHED: 'portfolio-photos-limit-reached',
  CATEGORY_FROZEN_POST_VERIFICATION:
    'portfolio-category-frozen-post-verification',
} as const;
