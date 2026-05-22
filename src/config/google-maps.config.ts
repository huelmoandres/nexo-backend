import { registerAs } from '@nestjs/config';

export const googleMapsConfig = registerAs('googleMaps', () => ({
  apiKey: process.env['GOOGLE_MAPS_API_KEY'] ?? '',
  timeoutMs: parseInt(process.env['GOOGLE_MAPS_TIMEOUT_MS'] ?? '5000', 10),
  region: 'uy',
  language: 'es',
  enabled: Boolean(process.env['GOOGLE_MAPS_API_KEY']?.trim()),
}));
