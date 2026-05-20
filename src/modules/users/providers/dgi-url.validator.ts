import { BadRequestException } from '@nestjs/common';
import { buildProblem } from '@common/errors/problem.factory';

/**
 * Valida que una URL de QR pertenezca a dominios oficiales DGI.
 *
 * @param rawUrl - URL extraída del QR.
 * @param allowedHosts - Lista de hostnames permitidos (sin protocolo).
 * @returns URL parseada lista para fetch.
 * @throws BadRequestException `DGI_QR_URL_INVALID` si el host no está en la whitelist.
 */
export function assertDgiQrUrlAllowed(
  rawUrl: string,
  allowedHosts: readonly string[],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException(
      buildProblem('DGI_QR_URL_INVALID', 'La URL del código QR no es válida.'),
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(
      buildProblem('DGI_QR_URL_INVALID', 'La URL del código QR no es válida.'),
    );
  }

  const host = parsed.hostname.toLowerCase();
  const allowed = allowedHosts.some(
    (h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`),
  );
  if (!allowed) {
    throw new BadRequestException(
      buildProblem(
        'DGI_QR_URL_INVALID',
        'La URL del código QR no pertenece a un dominio oficial de DGI.',
      ),
    );
  }

  return parsed;
}
