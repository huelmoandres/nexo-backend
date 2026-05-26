/** Cola BullMQ: verificación de constancia DGI (PDF + QR / texto). */
export const DGI_VERIFY_QUEUE = 'dgi-verify';

/** Cola BullMQ: mantenimiento DGI (watchdog PROCESSING + cleanup huérfanos R2). */
export const DGI_MAINTENANCE_QUEUE = 'dgi-maintenance';

/** Job: procesar PDF subido y actualizar estado de verificación. */
export const DGI_VERIFY_JOB = 'verify-rut-document';

/** Job: rechazar sujetos en PROCESSING más allá del timeout. */
export const DGI_STALE_WATCHDOG_JOB = 'dgi-stale-watchdog';

/** Job: eliminar PDFs de verificación no referenciados en DB. */
export const DGI_ORPHAN_CLEANUP_JOB = 'dgi-orphan-cleanup';

export type DgiVerificationMethod = 'QR' | 'TEXT_MATCH' | 'ADMIN_MANUAL';

export const DGI_STALE_REJECTION_REASON =
  'El procesamiento tardó demasiado. Volvé a subir la constancia.';

export const DGI_TECHNICAL_REJECTION_REASON =
  'No se pudo completar la verificación automática. Volvé a subir la constancia.';
