import { describe, expect, it } from 'vitest';
import { usersConfig } from '../users.config';

describe('usersConfig', () => {
  it('usa defaults cuando no hay variables de entorno', () => {
    delete process.env['USERS_ROLE_CACHE_TTL_MS'];
    delete process.env['KYC_BUCKET'];

    const config = usersConfig();

    expect(config.roleCacheTtlMs).toBe(30000);
    expect(config.kycBucket).toBe('nexos-kyc');
  });

  it('usa valores de entorno cuando existen', () => {
    process.env['USERS_ROLE_CACHE_TTL_MS'] = '60000';
    process.env['KYC_BUCKET'] = 'nexos-kyc-dev';

    const config = usersConfig();

    expect(config.roleCacheTtlMs).toBe(60000);
    expect(config.kycBucket).toBe('nexos-kyc-dev');

    delete process.env['USERS_ROLE_CACHE_TTL_MS'];
    delete process.env['KYC_BUCKET'];
  });

  it('roleCacheTtlMs es un número entero', () => {
    delete process.env['USERS_ROLE_CACHE_TTL_MS'];
    const config = usersConfig();
    expect(Number.isInteger(config.roleCacheTtlMs)).toBe(true);
  });
});
