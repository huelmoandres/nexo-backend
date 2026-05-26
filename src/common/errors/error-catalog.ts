/**
 * Catálogo central de errores RFC 7807 (`code` + `status` + `title` + `slug`).
 *
 * La URI `type` se deriva en `GlobalExceptionFilter` desde `code` y
 * `app.problemDetailTypeBaseUrl` cuando el cuerpo no trae `type`.
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
  SERVICE_UNAVAILABLE: {
    status: 503,
    title: 'Servicio no disponible',
    slug: 'service-unavailable',
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
  CATEGORY_SERVICE_REQUIRES_PARENT: {
    status: 400,
    title: 'El servicio requiere un oficio padre',
    slug: 'category-service-requires-parent',
  },
  CATEGORY_TYPE_INVALID_PARENT: {
    status: 400,
    title: 'El padre debe ser un oficio (TRADE)',
    slug: 'category-type-invalid-parent',
  },
  CATEGORY_TRADE_CANNOT_HAVE_PARENT: {
    status: 400,
    title: 'Un oficio no puede tener categoría padre',
    slug: 'category-trade-cannot-have-parent',
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
  RUT_ALREADY_REGISTERED: {
    status: 409,
    title: 'RUT ya registrado',
    slug: 'rut-already-registered',
  },
  PROFESSIONAL_ONBOARDING_ROLE_CONFLICT: {
    status: 409,
    title: 'Rol no compatible con onboarding profesional',
    slug: 'professional-onboarding-role-conflict',
  },
  COMPANY_ONBOARDING_ROLE_CONFLICT: {
    status: 409,
    title: 'Rol no compatible con registro de empresa',
    slug: 'company-onboarding-role-conflict',
  },
  EMPLOYEE_NOT_REGISTERED: {
    status: 404,
    title: 'Operador sin cuenta Nexos',
    slug: 'employee-not-registered',
  },
  EMPLOYEE_LINK_CONFLICT: {
    status: 409,
    title: 'No se puede vincular operador',
    slug: 'employee-link-conflict',
  },
  DGI_VERIFICATION_NO_RUT: {
    status: 400,
    title: 'RUT requerido para verificación DGI',
    slug: 'dgi-verification-no-rut',
  },
  DGI_VERIFICATION_ALREADY_VERIFIED: {
    status: 409,
    title: 'RUT ya verificado',
    slug: 'dgi-verification-already-verified',
  },
  DGI_VERIFICATION_IN_PROGRESS: {
    status: 409,
    title: 'Verificación DGI en curso',
    slug: 'dgi-verification-in-progress',
  },
  DGI_QR_URL_INVALID: {
    status: 400,
    title: 'URL del QR no pertenece a DGI',
    slug: 'dgi-qr-url-invalid',
  },
  DGI_SERVICE_UNAVAILABLE: {
    status: 503,
    title: 'Servicio DGI no disponible',
    slug: 'dgi-service-unavailable',
  },
  DGI_RUT_MISMATCH: {
    status: 422,
    title: 'RUT del documento no coincide',
    slug: 'dgi-rut-mismatch',
  },
  DGI_VERIFICATION_REJECTED: {
    status: 409,
    title: 'Verificación DGI rechazada',
    slug: 'dgi-verification-rejected',
  },
  DGI_VERIFICATION_SUBJECT_NOT_FOUND: {
    status: 404,
    title: 'Sujeto de verificación no encontrado',
    slug: 'dgi-verification-subject-not-found',
  },
  DGI_VERIFICATION_INVALID_FILE: {
    status: 400,
    title: 'Solo se aceptan documentos PDF para verificación DGI',
    slug: 'dgi-verification-invalid-file',
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
  /** Falta endpoint/credenciales R2; no se deben llamar operaciones remotas. */
  STORAGE_NOT_CONFIGURED: {
    status: 503,
    title: 'Storage no configurado',
    slug: 'storage-not-configured',
  },
  /** Presigned PUT exige `contentType` no vacío. */
  STORAGE_PRESIGN_CONTENT_TYPE_REQUIRED: {
    status: 400,
    title: 'Content-Type requerido',
    slug: 'storage-presign-content-type-required',
  },
  /** R2/S3 no disponible o error distinto de 404 (p. ej. HEAD fallido). */
  STORAGE_UNAVAILABLE: {
    status: 503,
    title: 'Storage no disponible',
    slug: 'storage-unavailable',
  },
  /** Fallback RFC 7807 para HTTP 410 sin `code` explícito en el cuerpo. */
  GONE: {
    status: 410,
    title: 'Ya no disponible',
    slug: 'gone',
  },
  CONSENT_TOKEN_NOT_FOUND: {
    status: 404,
    title: 'Token de consentimiento no encontrado',
    slug: 'consent-token-not-found',
  },
  CONSENT_TOKEN_EXPIRED: {
    status: 410,
    title: 'Token de consentimiento expirado',
    slug: 'consent-token-expired',
  },
  CONSENT_ALREADY_RESOLVED: {
    status: 410,
    title: 'Consentimiento ya respondido',
    slug: 'consent-already-resolved',
  },
  PORTFOLIO_ALREADY_VERIFIED: {
    status: 409,
    title: 'Portfolio ya verificado',
    slug: 'portfolio-already-verified',
  },
  PORTFOLIO_CONSENT_EXISTS: {
    status: 409,
    title: 'Ya existe solicitud de verificación',
    slug: 'portfolio-consent-exists',
  },
  PORTFOLIO_VERIFICATION_NOT_ELIGIBLE: {
    status: 400,
    title: 'Item no elegible para verificación',
    slug: 'portfolio-verification-not-eligible',
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
  PORTFOLIO_ITEM_NOT_REPORTABLE: {
    status: 409,
    title: 'El ítem no puede reportarse',
    slug: 'portfolio-item-not-reportable',
  },
  PORTFOLIO_ITEM_ALREADY_FLAGGED: {
    status: 409,
    title: 'El ítem ya está en revisión',
    slug: 'portfolio-item-already-flagged',
  },
  PORTFOLIO_CANNOT_REPORT_OWN_ITEM: {
    status: 403,
    title: 'No puedes reportar tu propio portfolio',
    slug: 'portfolio-cannot-report-own-item',
  },
  PORTFOLIO_NOT_IN_MODERATION_QUEUE: {
    status: 409,
    title: 'El ítem no está en cola de moderación',
    slug: 'portfolio-not-in-moderation-queue',
  },
  GEO_RESOLVE_INPUT_REQUIRED: {
    status: 400,
    title: 'Entrada de geolocalización requerida',
    slug: 'geo-resolve-input-required',
  },
  GEO_COUNTRY_NOT_FOUND: {
    status: 404,
    title: 'País de catálogo geo no encontrado',
    slug: 'geo-country-not-found',
  },
  PROFESSIONAL_LOCATION_REQUIRED: {
    status: 400,
    title: 'Ubicación del profesional requerida',
    slug: 'professional-location-required',
  },
  PROFESSIONAL_LOCATION_UNRESOLVED: {
    status: 400,
    title: 'No se pudo resolver la ubicación',
    slug: 'professional-location-unresolved',
  },
  TOO_MANY_REQUESTS: {
    status: 429,
    title: 'Demasiadas solicitudes',
    slug: 'too-many-requests',
  },
  SERVICE_AREA_LIMIT_REACHED: {
    status: 403,
    title: 'Límite de zonas de servicio',
    slug: 'service-area-limit-reached',
  },
  SERVICE_AREA_NOT_FOUND: {
    status: 404,
    title: 'Zona de servicio no encontrada',
    slug: 'service-area-not-found',
  },
  SERVICE_AREA_PRIMARY_REQUIRED: {
    status: 409,
    title: 'Zona principal requerida',
    slug: 'service-area-primary-required',
  },
  PLAN_ENTITLEMENTS_REQUIRED: {
    status: 400,
    title: 'Parámetros de plan requeridos',
    slug: 'plan-entitlements-required',
  },
  PLAN_ENTITLEMENTS_INVALID: {
    status: 400,
    title: 'Parámetros de plan inválidos',
    slug: 'plan-entitlements-invalid',
  },
  PLAN_DEFINITION_REQUIRED: {
    status: 400,
    title: 'Definición de plan requerida',
    slug: 'plan-definition-required',
  },
  PLAN_FEATURE_UNAVAILABLE: {
    status: 403,
    title: 'Función no disponible en tu plan',
    slug: 'plan-feature-unavailable',
  },
  COMPANY_ACCESS_DENIED: {
    status: 403,
    title: 'Acceso a empresa denegado',
    slug: 'company-access-denied',
  },
  EXCHANGE_RATE_NOT_AVAILABLE: {
    status: 503,
    title: 'Cotización no disponible',
    slug: 'exchange-rate-not-available',
  },
  BCU_FETCH_FAILED: {
    status: 502,
    title: 'No se pudo consultar el BCU',
    slug: 'bcu-fetch-failed',
  },
  JOB_NOT_FOUND: {
    status: 404,
    title: 'Trabajo no encontrado',
    slug: 'job-not-found',
  },
  JOB_ACCESS_DENIED: {
    status: 403,
    title: 'Sin acceso al trabajo',
    slug: 'job-access-denied',
  },
  JOB_INVALID_STATUS_TRANSITION: {
    status: 409,
    title: 'Transición de estado inválida',
    slug: 'job-invalid-status-transition',
  },
  JOB_ALREADY_ASSIGNED: {
    status: 409,
    title: 'Trabajo ya asignado',
    slug: 'job-already-assigned',
  },
  JOB_CURRENCY_INVALID: {
    status: 400,
    title: 'Moneda inválida',
    slug: 'job-currency-invalid',
  },
  JOB_PRICE_LINES_REQUIRED: {
    status: 400,
    title: 'Líneas de precio requeridas',
    slug: 'job-price-lines-required',
  },
  JOB_CHANGE_ORDER_NOT_FOUND: {
    status: 404,
    title: 'Orden de cambio no encontrada',
    slug: 'job-change-order-not-found',
  },
  JOB_CHANGE_ORDER_INVALID_STATUS: {
    status: 409,
    title: 'Estado de orden de cambio inválido',
    slug: 'job-change-order-invalid-status',
  },
  INVALID_ESCROW_TRANSITION: {
    status: 409,
    title: 'Transición de escrow inválida',
    slug: 'invalid-escrow-transition',
  },
  ESCROW_NOT_FOUND: {
    status: 404,
    title: 'Escrow no encontrado',
    slug: 'escrow-not-found',
  },
  PAYMENT_WEBHOOK_INVALID: {
    status: 401,
    title: 'Webhook de pago inválido',
    slug: 'payment-webhook-invalid',
  },
  PAYMENT_CHECKOUT_FAILED: {
    status: 502,
    title: 'No se pudo iniciar el pago',
    slug: 'payment-checkout-failed',
  },
  PAYMENT_NOT_ALLOWED: {
    status: 409,
    title: 'Pago no permitido en este estado',
    slug: 'payment-not-allowed',
  },
  PAYMENT_AMOUNT_MISMATCH: {
    status: 409,
    title: 'Monto del pago no coincide',
    slug: 'payment-amount-mismatch',
  },
  PAYMENT_RATE_STALE: {
    status: 503,
    title: 'Cotización desactualizada; no se puede cobrar en USD',
    slug: 'payment-rate-stale',
  },
  BILLING_PLAN_NOT_AVAILABLE: {
    status: 400,
    title: 'Plan de suscripción no disponible',
    slug: 'billing-plan-not-available',
  },
  BILLING_SUBSCRIPTION_EXISTS: {
    status: 409,
    title: 'Ya existe una suscripción activa',
    slug: 'billing-subscription-exists',
  },
  BILLING_SUBSCRIPTION_NOT_FOUND: {
    status: 404,
    title: 'Suscripción no encontrada',
    slug: 'billing-subscription-not-found',
  },
  BILLING_SUBSCRIBE_FAILED: {
    status: 502,
    title: 'No se pudo iniciar la suscripción',
    slug: 'billing-subscribe-failed',
  },
  BILLING_CANCEL_FAILED: {
    status: 502,
    title: 'No se pudo cancelar la suscripción en Mercado Pago',
    slug: 'billing-cancel-failed',
  },
  BILLING_WEBHOOK_INVALID: {
    status: 401,
    title: 'Webhook de suscripción inválido',
    slug: 'billing-webhook-invalid',
  },
  BILLING_RATE_STALE: {
    status: 503,
    title: 'Cotización desactualizada; no se puede suscribir en USD',
    slug: 'billing-rate-stale',
  },
  PAYOUT_ACCOUNT_REQUIRED: {
    status: 409,
    title: 'Cuenta de cobro requerida',
    slug: 'payout-account-required',
  },
  PAYOUT_PRIMARY_REQUIRED: {
    status: 409,
    title: 'Cuenta de cobro primaria requerida',
    slug: 'payout-primary-required',
  },
  PAYOUT_ACCOUNT_NOT_FOUND: {
    status: 404,
    title: 'Cuenta de cobro no encontrada',
    slug: 'payout-account-not-found',
  },
  PAYOUT_ACCOUNT_NOT_OWNED: {
    status: 403,
    title: 'Cuenta de cobro no pertenece al sujeto',
    slug: 'payout-account-not-owned',
  },
  PAYOUT_IDENTIFIER_INVALID: {
    status: 400,
    title: 'Identificador de cobro inválido',
    slug: 'payout-identifier-invalid',
  },
  PAYOUT_BANK_NOT_ALLOWED: {
    status: 400,
    title: 'Banco no permitido',
    slug: 'payout-bank-not-allowed',
  },
  PAYOUT_DESTINATION_REJECTED: {
    status: 422,
    title: 'Destino de cobro rechazado por la pasarela',
    slug: 'payout-destination-rejected',
  },
  PAYOUT_NOT_RETRYABLE: {
    status: 409,
    title: 'Payout no reintentable en este estado',
    slug: 'payout-not-retryable',
  },
  PAYOUT_MAX_ATTEMPTS: {
    status: 409,
    title: 'Máximo de reintentos de payout alcanzado',
    slug: 'payout-max-attempts',
  },
  PAYOUT_NOT_CONFIRMABLE: {
    status: 409,
    title: 'Payout no confirmable en este estado',
    slug: 'payout-not-confirmable',
  },
  PAYOUT_ALREADY_SUCCEEDED: {
    status: 409,
    title: 'Payout ya confirmado',
    slug: 'payout-already-succeeded',
  },
  PAYOUT_RECEIPT_REQUIRED: {
    status: 400,
    title: 'Comprobante de pago obligatorio',
    slug: 'payout-receipt-required',
  },
  PAYOUT_RECEIPT_INVALID_KEY: {
    status: 400,
    title: 'Clave de comprobante inválida',
    slug: 'payout-receipt-invalid-key',
  },
  PAYOUT_MANUAL_ONLY: {
    status: 409,
    title: 'Payout automático deshabilitado; usar confirmación manual',
    slug: 'payout-manual-only',
  },
} as const;
