/**
 * Catálogo central de errores RFC 7807 (`code` + `status` + `title` + `slug`).
 *
 * La URI `type` se deriva en `GlobalExceptionFilter` desde `code` vía
 * `ProblemDetailTypeService.fromScreamingCode` cuando el cuerpo no trae `type`.
 *
 * Lista humana: `docs/reference/api-standards.md`.
 */
export const ERRORS = {
  VALIDATION_ERROR: {
    status: 400,
    title: 'Solicitud inválida',
    slug: 'validation-error',
  },
  INTERNAL_SERVER_ERROR: {
    status: 500,
    title: 'Error interno del servidor',
    slug: 'internal-server-error',
  },
  BAD_REQUEST: {
    status: 400,
    title: 'Solicitud inválida',
    slug: 'bad-request',
  },
  UNAUTHORIZED: {
    status: 401,
    title: 'No autorizado',
    slug: 'unauthorized',
  },
  FORBIDDEN: {
    status: 403,
    title: 'Prohibido',
    slug: 'forbidden',
  },
  NOT_FOUND: {
    status: 404,
    title: 'Recurso no encontrado',
    slug: 'not-found',
  },
  CONFLICT: {
    status: 409,
    title: 'Conflicto',
    slug: 'conflict',
  },
  UNPROCESSABLE_ENTITY: {
    status: 422,
    title: 'Entidad no procesable',
    slug: 'unprocessable-entity',
  },
  HTTP_ERROR: {
    status: 500,
    title: 'Error',
    slug: 'http-error',
  },
  AUTH_INVALID_TOKEN: {
    status: 401,
    title: 'Token inválido',
    slug: 'auth-invalid-token',
  },
  AUTH_TOKEN_MISSING: {
    status: 401,
    title: 'Token no proporcionado',
    slug: 'auth-token-missing',
  },
  AUTH_TOKEN_REVOKED: {
    status: 401,
    title: 'Sesión cerrada',
    slug: 'auth-token-revoked',
  },
  AUTH_INSUFFICIENT_PERMISSIONS: {
    status: 403,
    title: 'Permisos insuficientes',
    slug: 'auth-insufficient-permissions',
  },
  USER_NOT_FOUND: {
    status: 404,
    title: 'Usuario no encontrado',
    slug: 'user-not-found',
  },
  PROFESSIONAL_PROFILE_EXISTS: {
    status: 409,
    title: 'Perfil ya existente',
    slug: 'professional-profile-exists',
  },
  PROFESSIONAL_PROFILE_NOT_FOUND: {
    status: 404,
    title: 'Perfil profesional no encontrado',
    slug: 'professional-profile-not-found',
  },
  CATEGORY_NOT_FOUND: {
    status: 404,
    title: 'Categoría no encontrada',
    slug: 'category-not-found',
  },
  /** Uno o más `categoryId` del DTO no existen (validación previa a persistir). */
  INVALID_CATEGORY_IDS: {
    status: 400,
    title: 'Categorías inválidas',
    slug: 'invalid-category-ids',
  },
  CATEGORY_SLUG_DUPLICATE: {
    status: 409,
    title: 'Slug duplicado',
    slug: 'category-slug-duplicate',
  },
  KYC_INVALID_FILE_EXTENSION: {
    status: 400,
    title: 'Extensión de archivo inválida',
    slug: 'kyc-invalid-file-extension',
  },
  RUT_INVALID: {
    status: 400,
    title: 'RUT inválido',
    slug: 'rut-invalid',
  },
  USER_ALREADY_OWNS_COMPANY: {
    status: 409,
    title: 'Empresa ya registrada',
    slug: 'user-already-owns-company',
  },
  COMPANY_RUT_DUPLICATE: {
    status: 409,
    title: 'RUT duplicado',
    slug: 'company-rut-duplicate',
  },
  STORAGE_FORBIDDEN_KEY: {
    status: 403,
    title: 'Acceso denegado al storage',
    slug: 'storage-forbidden-key',
  },
  /** Objeto inexistente en R2 (HEAD/404 o equivalente S3). */
  STORAGE_OBJECT_NOT_FOUND: {
    status: 404,
    title: 'Objeto no encontrado en storage',
    slug: 'storage-object-not-found',
  },
  PORTFOLIO_ITEM_NOT_FOUND: {
    status: 404,
    title: 'PortfolioItem no encontrado',
    slug: 'portfolio-item-not-found',
  },
  PORTFOLIO_PHOTO_NOT_FOUND: {
    status: 404,
    title: 'Foto no encontrada',
    slug: 'portfolio-photo-not-found',
  },
  PORTFOLIO_CATEGORY_NOT_FOUND: {
    status: 404,
    title: 'Categoría no encontrada',
    slug: 'portfolio-category-not-found',
  },
  PORTFOLIO_JOB_NOT_FOUND: {
    status: 404,
    title: 'Job no encontrado',
    slug: 'portfolio-job-not-found',
  },
  PORTFOLIO_JOB_NOT_CLOSED: {
    status: 409,
    title: 'Job no cerrado',
    slug: 'portfolio-job-not-closed',
  },
  PORTFOLIO_CATEGORY_MISMATCH_JOB: {
    status: 409,
    title: 'Categoría no coincide con el Job',
    slug: 'portfolio-category-mismatch-job',
  },
  PORTFOLIO_CATEGORY_FROZEN_POST_VERIFICATION: {
    status: 409,
    title: 'Categoría congelada post-verificación',
    slug: 'portfolio-category-frozen-post-verification',
  },
  PORTFOLIO_FILEKEY_DUPLICATE: {
    status: 409,
    title: 'fileKey duplicado',
    slug: 'portfolio-filekey-duplicate',
  },
  PORTFOLIO_PHOTOS_LIMIT_REACHED: {
    status: 409,
    title: 'Límite de fotos alcanzado',
    slug: 'portfolio-photos-limit-reached',
  },
  PORTFOLIO_ITEM_NOT_DRAFT: {
    status: 409,
    title: 'El item no está en DRAFT',
    slug: 'portfolio-item-not-draft',
  },
  PORTFOLIO_PHOTOS_REQUIRED: {
    status: 409,
    title: 'El item no tiene fotos',
    slug: 'portfolio-photos-required',
  },
  PORTFOLIO_PHOTOS_NOT_READY: {
    status: 409,
    title: 'Fotos no disponibles en storage',
    slug: 'portfolio-photos-not-ready',
  },
  PORTFOLIO_PHOTOS_STORAGE_UNAVAILABLE: {
    status: 503,
    title: 'Storage no disponible',
    slug: 'portfolio-photos-storage-unavailable',
  },
} as const;
