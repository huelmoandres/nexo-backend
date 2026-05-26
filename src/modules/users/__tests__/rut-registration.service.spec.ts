import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RutRegistrationService } from '../services/rut-registration.service';

describe('RutRegistrationService', () => {
  const makeRepo = (overrides: Record<string, unknown> = {}) => ({
    isRutTakenGlobally: vi.fn().mockResolvedValue(false),
    ...overrides,
  });

  it('resolveRut devuelve undefined para vacío', () => {
    const svc = new RutRegistrationService(makeRepo() as never);
    expect(svc.resolveRut(undefined)).toBeUndefined();
    expect(svc.resolveRut('   ')).toBeUndefined();
  });

  it('resolveRut normaliza RUT válido', () => {
    const svc = new RutRegistrationService(makeRepo() as never);
    expect(svc.resolveRut('214567890018')).toBe('214567890018');
  });

  it('resolveRut lanza RUT_INVALID si DGI falla', () => {
    const svc = new RutRegistrationService(makeRepo() as never);
    expect(() => svc.resolveRut('000000000001')).toThrow(BadRequestException);
  });

  it('resolveRequiredRut exige valor', () => {
    const svc = new RutRegistrationService(makeRepo() as never);
    expect(() => svc.resolveRequiredRut('   ')).toThrow(BadRequestException);
  });

  it('resolveRequiredRut devuelve RUT normalizado válido', () => {
    const svc = new RutRegistrationService(makeRepo() as never);
    expect(svc.resolveRequiredRut('214567890018')).toBe('214567890018');
  });

  it('assertRutAvailable lanza RUT_ALREADY_REGISTERED', async () => {
    const repo = makeRepo({
      isRutTakenGlobally: vi.fn().mockResolvedValue(true),
    });
    const svc = new RutRegistrationService(repo as never);

    await expect(svc.assertRutAvailable('214567890018')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('assertRutAvailable no lanza si está libre', async () => {
    const repo = makeRepo({
      isRutTakenGlobally: vi.fn().mockResolvedValue(false),
    });
    const svc = new RutRegistrationService(repo as never);

    await expect(
      svc.assertRutAvailable('214567890018'),
    ).resolves.toBeUndefined();
  });
});
