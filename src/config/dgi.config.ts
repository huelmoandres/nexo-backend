import { registerAs } from '@nestjs/config';

/**
 * Configuración del flujo de verificación DGI (constancia PDF + QR).
 *
 * Variables opcionales:
 *   - `DGI_LOOKUP_PROVIDER` — `web_scraper` (default) | `soap` (futuro)
 *   - `DGI_FETCH_TIMEOUT_MS` — timeout HTTP a efactura.dgi.gub.uy (default 10000)
 *   - `DGI_VERIFY_QUEUE_ENABLED` — `false` deshabilita encolado (tests)
 */
export const dgiConfig = registerAs('dgi', () => ({
  lookupProvider: (process.env['DGI_LOOKUP_PROVIDER'] ?? 'web_scraper') as
    | 'web_scraper'
    | 'soap',
  fetchTimeoutMs: parseInt(process.env['DGI_FETCH_TIMEOUT_MS'] ?? '10000', 10),
  queueEnabled: process.env['DGI_VERIFY_QUEUE_ENABLED'] !== 'false',
  allowedHosts: [
    'www.efactura.dgi.gub.uy',
    'efactura.dgi.gub.uy',
    'www.dgi.gub.uy',
    'dgi.gub.uy',
    'servicios.dgi.gub.uy',
  ],
  pdfMaxBytes: 10 * 1024 * 1024,
}));
