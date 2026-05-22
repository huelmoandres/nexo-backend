import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceAreaFactory } from '@test/factories/service-area.factory';
import { ServiceAreaService } from '../service-area.service';

describe('ServiceAreaService', () => {
  const repository = {
    listForProfessional: vi.fn(),
    listForCompany: vi.fn(),
    findById: vi.fn(),
    countForProfessional: vi.fn(),
    countForCompany: vi.fn(),
    getCoordinates: vi.fn(),
    createForProfessional: vi.fn(),
    createForCompany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const entitlements = {
    assertCanAddServiceArea: vi.fn(),
    assertRadiusWithinPlan: vi.fn(),
    assertCompanyAdmin: vi.fn(),
  };

  const usersRepository = {
    findBySupabaseUidForMe: vi.fn(),
  };

  const makeService = () =>
    new ServiceAreaService(
      repository as never,
      entitlements as never,
      usersRepository as never,
    );

  const mockCoords = () =>
    repository.getCoordinates.mockResolvedValue({
      latitude: -34.9,
      longitude: -56.16,
    });

  beforeEach(() => vi.clearAllMocks());

  it('listForCurrentProfessional mapea zonas', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    const area = serviceAreaFactory.build({ professionalProfileId: 'pp-1' });
    repository.listForProfessional.mockResolvedValue([area]);
    mockCoords();
    const svc = makeService();
    const list = await svc.listForCurrentProfessional('uid');
    expect(list).toHaveLength(1);
    expect(list[0]?.latitude).toBe(-34.9);
  });

  it('createForCurrentProfessional respeta isPrimary explícito', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.listForProfessional.mockResolvedValue([
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    ]);
    repository.createForProfessional.mockResolvedValue(
      serviceAreaFactory.build({ isPrimary: true }),
    );
    mockCoords();
    const svc = makeService();
    await svc.createForCurrentProfessional('uid', {
      label: 'Zona 2',
      latitude: -34.9,
      longitude: -56.16,
      isPrimary: true,
    });
    expect(repository.createForProfessional).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
    );
  });

  it('createForCurrentProfessional primera zona es primary', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.listForProfessional.mockResolvedValue([]);
    const created = serviceAreaFactory.build({
      professionalProfileId: 'pp-1',
      isPrimary: true,
    });
    repository.createForProfessional.mockResolvedValue(created);
    mockCoords();
    const svc = makeService();
    await svc.createForCurrentProfessional('uid', {
      label: 'Zona 1',
      latitude: -34.9,
      longitude: -56.16,
    });
    expect(repository.createForProfessional).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
    );
  });

  it('updateForCurrentProfessional valida ownership', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    );
    repository.update.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1', label: 'Upd' }),
    );
    mockCoords();
    const svc = makeService();
    await svc.updateForCurrentProfessional('uid', 'sa-1', { label: 'Upd' });
    expect(repository.update).toHaveBeenCalled();
  });

  it('update ownership inválido lanza NOT_FOUND', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'other' }),
    );
    const svc = makeService();
    await expect(
      svc.updateForCurrentProfessional('uid', 'sa-1', { label: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteForCurrentProfessional bloquea única zona principal', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    const area = serviceAreaFactory.build({
      professionalProfileId: 'pp-1',
      isPrimary: true,
    });
    repository.findById.mockResolvedValue(area);
    repository.countForProfessional.mockResolvedValue(1);
    const svc = makeService();
    await expect(
      svc.deleteForCurrentProfessional('uid', area.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('deleteForCurrentProfessional permite borrar primary si hay más zonas', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    const area = serviceAreaFactory.build({
      professionalProfileId: 'pp-1',
      isPrimary: true,
    });
    repository.findById.mockResolvedValue(area);
    repository.countForProfessional.mockResolvedValue(2);
    const svc = makeService();
    await svc.deleteForCurrentProfessional('uid', area.id);
    expect(repository.countForProfessional).toHaveBeenCalled();
    expect(repository.delete).toHaveBeenCalledWith(area.id);
  });

  it('deleteForCurrentProfessional permite borrar no-primary', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    const area = serviceAreaFactory.build({
      professionalProfileId: 'pp-1',
      isPrimary: false,
    });
    repository.findById.mockResolvedValue(area);
    const svc = makeService();
    await svc.deleteForCurrentProfessional('uid', area.id);
    expect(repository.delete).toHaveBeenCalledWith(area.id);
  });

  it('listForCompany tras assertCompanyAdmin', async () => {
    repository.listForCompany.mockResolvedValue([
      serviceAreaFactory.build({ companyId: 'co-1' }),
      serviceAreaFactory.build({ companyId: 'co-1', id: 'sa-2' }),
    ]);
    mockCoords();
    const svc = makeService();
    const list = await svc.listForCompany('uid', 'co-1');
    expect(entitlements.assertCompanyAdmin).toHaveBeenCalled();
    expect(list).toHaveLength(2);
  });

  it('createForCompany con zonas previas usa isPrimary false por defecto', async () => {
    repository.listForCompany.mockResolvedValue([
      serviceAreaFactory.build({ companyId: 'co-1' }),
    ]);
    repository.createForCompany.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1' }),
    );
    mockCoords();
    const svc = makeService();
    await svc.createForCompany('uid', 'co-1', {
      label: 'Sucursal',
      latitude: -34,
      longitude: -56,
    });
    expect(repository.createForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: false }),
    );
  });

  it('createForCompany respeta isPrimary explícito', async () => {
    repository.listForCompany.mockResolvedValue([
      serviceAreaFactory.build({ companyId: 'co-1' }),
    ]);
    repository.createForCompany.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', isPrimary: true }),
    );
    mockCoords();
    const svc = makeService();
    await svc.createForCompany('uid', 'co-1', {
      label: 'HQ',
      latitude: -34,
      longitude: -56,
      isPrimary: true,
    });
    expect(repository.createForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
    );
  });

  it('createForCompany con zonas previas no fuerza primary', async () => {
    repository.listForCompany.mockResolvedValue([
      serviceAreaFactory.build({ companyId: 'co-1' }),
    ]);
    repository.createForCompany.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', isPrimary: false }),
    );
    mockCoords();
    const svc = makeService();
    await svc.createForCompany('uid', 'co-1', {
      label: 'Sucursal',
      latitude: -34,
      longitude: -56,
      isPrimary: false,
    });
    expect(repository.createForCompany).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: false }),
    );
  });

  it('toResponse usa 0 cuando no hay coordenadas', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.listForProfessional.mockResolvedValue([
      serviceAreaFactory.build(),
    ]);
    repository.getCoordinates.mockResolvedValue(null);
    const svc = makeService();
    const list = await svc.listForCurrentProfessional('uid');
    expect(list[0]?.latitude).toBe(0);
    expect(list[0]?.longitude).toBe(0);
  });

  it('updateForCurrentProfessional con lat/lng', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    );
    repository.update.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    );
    mockCoords();
    const svc = makeService();
    await svc.updateForCurrentProfessional('uid', 'sa-1', {
      latitude: -35,
      longitude: -57,
    });
    const updatePayload = repository.update.mock.calls[0]?.[1] as {
      latitude?: number;
      longitude?: number;
    };
    expect(updatePayload.latitude).toBe(-35);
    expect(updatePayload.longitude).toBe(-57);
  });

  it('updateForCompany solo cambia radius', async () => {
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', radiusMeters: 5000 }),
    );
    repository.update.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', radiusMeters: 8000 }),
    );
    mockCoords();
    const svc = makeService();
    await svc.updateForCompany('uid', 'co-1', 'sa-1', { radiusMeters: 8000 });
    expect(entitlements.assertRadiusWithinPlan).toHaveBeenCalledWith(
      'company',
      'co-1',
      8000,
    );
  });

  it('updateForCompany con isPrimary desmarca otras', async () => {
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1' }),
    );
    repository.update.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', isPrimary: true }),
    );
    mockCoords();
    const svc = makeService();
    await svc.updateForCompany('uid', 'co-1', 'sa-1', { isPrimary: true });
    const updateArg = repository.update.mock.calls[0]?.[1] as {
      clearPrimaryOnSubject?: { companyId: string };
    };
    expect(updateArg.clearPrimaryOnSubject).toEqual({ companyId: 'co-1' });
  });

  it('deleteForCompany permite borrar primary si hay más zonas', async () => {
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', isPrimary: true }),
    );
    repository.countForCompany.mockResolvedValue(2);
    const svc = makeService();
    await svc.deleteForCompany('uid', 'co-1', 'sa-1');
    expect(repository.delete).toHaveBeenCalledWith('sa-1');
  });

  it('deleteForCompany permite borrar zona no principal', async () => {
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'co-1', isPrimary: false }),
    );
    const svc = makeService();
    await svc.deleteForCompany('uid', 'co-1', 'sa-1');
    expect(repository.delete).toHaveBeenCalledWith('sa-1');
  });

  it('applyUpdate professional con isPrimary', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: { id: 'pp-1' },
    });
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    );
    repository.update.mockResolvedValue(
      serviceAreaFactory.build({ professionalProfileId: 'pp-1' }),
    );
    mockCoords();
    const svc = makeService();
    await svc.updateForCurrentProfessional('uid', 'sa-1', { isPrimary: true });
    const updateArg = repository.update.mock.calls[0]?.[1] as {
      clearPrimaryOnSubject?: { professionalProfileId: string };
    };
    expect(updateArg.clearPrimaryOnSubject).toEqual({
      professionalProfileId: 'pp-1',
    });
  });

  it('deleteForCompany ownership inválido', async () => {
    repository.findById.mockResolvedValue(
      serviceAreaFactory.build({ companyId: 'other' }),
    );
    const svc = makeService();
    await expect(
      svc.deleteForCompany('uid', 'co-1', 'sa-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sin perfil profesional lanza NOT_FOUND', async () => {
    usersRepository.findBySupabaseUidForMe.mockResolvedValue({
      professionalProfile: null,
    });
    const svc = makeService();
    await expect(
      svc.listForCurrentProfessional('uid'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
