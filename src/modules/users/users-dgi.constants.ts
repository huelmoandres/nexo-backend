/** Cola BullMQ: verificación de constancia DGI (PDF + QR / texto). */
export const DGI_VERIFY_QUEUE = 'dgi-verify';

/** Job: procesar PDF subido y actualizar estado de verificación. */
export const DGI_VERIFY_JOB = 'verify-rut-document';

export type DgiVerificationMethod = 'QR' | 'TEXT_MATCH' | 'ADMIN_MANUAL';
