import { ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { buildProblem } from '@common/errors/problem.factory';

/**
 * Helpers centralizados para construir y validar `key`s de object storage.
 *
 * Toda lógica de paths del repo DEBE pasar por este archivo. Ningún módulo
 * de negocio construye keys con template literals ad hoc; eso garantiza que
 * la validación de ownership (`assertKeyBelongsToUser`) y las regex de
 * persistencia (`KYC_KEY_PATTERN`, `PORTFOLIO_PHOTO_KEY_PATTERN`) sigan
 * coherentes con la convención canónica.
 *
 * Convención canónica:
 *   users/<userId>/<tipo>/[<subPath>/]<uuid>.<ext>
 *
 * Ver [.harness/specs/storage-rules.md §4](.harness/specs/storage-rules.md).
 */

/** Prefijo raíz obligatorio de todas las keys del sistema. */
export const USER_ROOT_PREFIX = 'users';

const UUID_RE_PART =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Regex de validación para keys de documentos KYC.
 *
 * Formato: `users/<userId>/kyc/<DOCUMENT_KIND>-<uuid>.<ext>`
 * - `<DOCUMENT_KIND>`: enum `PresignDocumentKind` (`IDENTITY_CARD` | `SELFIE`).
 * - `<ext>`: jpg | jpeg | png | pdf (canónicas para documentos).
 */
export const KYC_KEY_PATTERN = new RegExp(
  `^users/[A-Za-z0-9_-]+/kyc/[A-Z_]+-${UUID_RE_PART}\\.(jpg|jpeg|png|pdf)$`,
);

/**
 * Regex de validación para keys de fotos del portfolio.
 *
 * Formato: `users/<userId>/portfolio/<itemId>/<uuid>.<ext>`
 * - `<ext>`: jpg | jpeg | png | webp (canónicas para fotos web).
 */
export const PORTFOLIO_PHOTO_KEY_PATTERN = new RegExp(
  `^users/[A-Za-z0-9_-]+/portfolio/[A-Za-z0-9-]+/${UUID_RE_PART}\\.(jpg|jpeg|png|webp)$`,
);

/**
 * Regex de validación para constancias DGI (PDF).
 *
 * Formato: `users/<userId>/verification/<uuid>.pdf`
 */
export const VERIFICATION_DOC_KEY_PATTERN = new RegExp(
  `^users/[A-Za-z0-9_-]+/verification/${UUID_RE_PART}\\.pdf$`,
);

/**
 * Comprobante de payout manual (admin).
 * Formato: `escrow/<escrowTransactionId>/payout-receipts/<uuid>.<ext>`
 */
export const PAYOUT_RECEIPT_KEY_PATTERN = new RegExp(
  `^escrow/${UUID_RE_PART}/payout-receipts/${UUID_RE_PART}\\.(jpg|jpeg|png|pdf)$`,
);

/**
 * Devuelve el prefijo canónico del scope de un usuario.
 *
 * @param userId - ID del usuario (UUID o slug compatible con `[A-Za-z0-9_-]+`).
 * @returns Cadena `users/<userId>/`.
 * @throws Error Si `userId` está vacío o contiene caracteres prohibidos.
 */
export function userScope(userId: string): string {
  assertValidUserId(userId);
  return `${USER_ROOT_PREFIX}/${userId}/`;
}

/**
 * Devuelve el prefijo de un item de portfolio (para list-y-delete masivo).
 *
 * @param userId - ID del profesional dueño del item.
 * @param itemId - ID del PortfolioItem.
 * @returns Cadena `users/<userId>/portfolio/<itemId>/`.
 */
export function portfolioItemScope(userId: string, itemId: string): string {
  assertValidUserId(userId);
  assertValidIdSegment(itemId, 'itemId');
  return `${userScope(userId)}portfolio/${itemId}/`;
}

/**
 * Construye la key canónica para un documento KYC.
 *
 * @param userId - ID del usuario que sube el documento.
 * @param kind - Tipo de documento (`IDENTITY_CARD` | `SELFIE`).
 *               Debe ser SCREAMING_SNAKE_CASE.
 * @param ext - Extensión sin punto (jpg | jpeg | png | pdf).
 * @returns Cadena `users/<userId>/kyc/<KIND>-<uuid>.<ext>`.
 */
export function buildKycKey(userId: string, kind: string, ext: string): string {
  assertValidUserId(userId);
  if (!/^[A-Z_]+$/.test(kind)) {
    throw new Error(`buildKycKey: invalid kind "${kind}" (expected [A-Z_]+)`);
  }
  const safeExt = normalizeExtension(ext, ['jpg', 'jpeg', 'png', 'pdf']);
  return `${userScope(userId)}kyc/${kind}-${randomUUID()}.${safeExt}`;
}

/**
 * Construye la key canónica para una foto del portfolio.
 *
 * @param userId - ID del profesional dueño del item.
 * @param itemId - ID del PortfolioItem al que pertenece la foto.
 * @param ext - Extensión sin punto (jpg | jpeg | png | webp).
 * @returns Cadena `users/<userId>/portfolio/<itemId>/<uuid>.<ext>`.
 */
export function buildPortfolioPhotoKey(
  userId: string,
  itemId: string,
  ext: string,
): string {
  assertValidUserId(userId);
  assertValidIdSegment(itemId, 'itemId');
  const safeExt = normalizeExtension(ext, ['jpg', 'jpeg', 'png', 'webp']);
  return `${portfolioItemScope(userId, itemId)}${randomUUID()}.${safeExt}`;
}

/**
 * Construye la key canónica para una constancia DGI (PDF).
 *
 * @param userId - Usuario que sube el documento.
 * @param ext - Extensión sin punto (solo `pdf` permitido).
 * @returns Cadena `users/<userId>/verification/<uuid>.pdf`.
 */
export function buildVerificationDocKey(userId: string, ext: string): string {
  assertValidUserId(userId);
  const safeExt = normalizeExtension(ext, ['pdf']);
  return `${userScope(userId)}verification/${randomUUID()}.${safeExt}`;
}

/**
 * Key para comprobante de transferencia manual al profesional.
 */
export function buildPayoutReceiptKey(
  escrowTransactionId: string,
  ext: string,
): string {
  assertValidIdSegment(escrowTransactionId, 'escrowTransactionId');
  const safeExt = normalizeExtension(ext, ['jpg', 'jpeg', 'png', 'pdf']);
  return `escrow/${escrowTransactionId}/payout-receipts/${randomUUID()}.${safeExt}`;
}

/**
 * Valida que la key de comprobante corresponda al escrow indicado.
 */
export function assertPayoutReceiptKeyForEscrow(
  key: string,
  escrowTransactionId: string,
): void {
  if (!PAYOUT_RECEIPT_KEY_PATTERN.test(key)) {
    throw new Error(`storage-paths: invalid payout receipt key "${key}"`);
  }
  const prefix = `escrow/${escrowTransactionId}/payout-receipts/`;
  if (!key.startsWith(prefix)) {
    throw new Error(
      `storage-paths: receipt key does not belong to escrow ${escrowTransactionId}`,
    );
  }
}

/**
 * Extrae el `userId` de una key canónica.
 *
 * @param key - Key con formato `users/<userId>/...`.
 * @returns El `userId` extraído, o `null` si el formato no es válido.
 */
export function parseUserIdFromKey(key: string): string | null {
  const match = key.match(/^users\/([A-Za-z0-9_-]+)\//);
  if (match === null) {
    return null;
  }
  return match[1];
}

/**
 * Valida que `key` pertenezca al `userId` dado.
 *
 * Comprueba que el `key` empieza con `userScope(userId)`. Es la única
 * forma autorizada de chequear ownership de paths en el repo
 * (`StorageService.deleteObjectForUser`, DTOs que reciben `fileKey`,
 * workers que actúan sobre input de usuario).
 *
 * @param key - Key a validar.
 * @param userId - ID del usuario que se espera dueño.
 * @throws ForbiddenException Con `code: STORAGE_FORBIDDEN_KEY` si el key
 *         no empieza con `users/<userId>/`.
 */
export function assertKeyBelongsToUser(key: string, userId: string): void {
  if (!key.startsWith(userScope(userId))) {
    throw new ForbiddenException(
      buildProblem(
        'STORAGE_FORBIDDEN_KEY',
        'The storage key does not belong to the authenticated user.',
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const USER_ID_RE = /^[A-Za-z0-9_-]+$/;

function assertValidUserId(userId: string): void {
  if (!userId || !USER_ID_RE.test(userId)) {
    throw new Error(
      `storage-paths: invalid userId "${userId}" (expected [A-Za-z0-9_-]+)`,
    );
  }
}

function assertValidIdSegment(value: string, label: string): void {
  if (!value || !USER_ID_RE.test(value)) {
    throw new Error(
      `storage-paths: invalid ${label} "${value}" (expected [A-Za-z0-9_-]+)`,
    );
  }
}

function normalizeExtension(ext: string, allowed: readonly string[]): string {
  const lower = ext.toLowerCase().replace(/^\./, '');
  if (!allowed.includes(lower)) {
    throw new Error(
      `storage-paths: extension "${ext}" not in allowed set [${allowed.join(', ')}]`,
    );
  }
  return lower;
}
