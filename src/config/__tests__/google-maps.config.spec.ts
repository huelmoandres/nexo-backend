import { describe, expect, it } from 'vitest';
import { googleMapsConfig } from '../google-maps.config';

describe('googleMapsConfig', () => {
  it('deshabilitado sin API key', () => {
    delete process.env['GOOGLE_MAPS_API_KEY'];
    const config = googleMapsConfig();
    expect(config.enabled).toBe(false);
    expect(config.apiKey).toBe('');
    expect(config.region).toBe('uy');
    expect(config.language).toBe('es');
  });

  it('habilitado con API key', () => {
    process.env['GOOGLE_MAPS_API_KEY'] = 'test-key';
    const config = googleMapsConfig();
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe('test-key');
    delete process.env['GOOGLE_MAPS_API_KEY'];
  });

  it('lee timeout desde entorno', () => {
    process.env['GOOGLE_MAPS_TIMEOUT_MS'] = '3000';
    expect(googleMapsConfig().timeoutMs).toBe(3000);
    delete process.env['GOOGLE_MAPS_TIMEOUT_MS'];
  });
});
