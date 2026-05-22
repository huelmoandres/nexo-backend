import { describe, expect, it, vi } from 'vitest';
import { ServiceAreaRepository } from '../service-area.repository';

describe('ServiceAreaRepository', () => {
  const makeRepo = () => {
    const prisma = {
      serviceArea: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn(),
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: {
            updateMany: vi.fn(),
            update: vi.fn().mockResolvedValue({ id: 'sa-1', label: 'X' }),
          },
          $queryRawUnsafe: vi
            .fn()
            .mockResolvedValue([{ id: 'sa-new', label: 'Nueva' }]),
          $executeRawUnsafe: vi.fn(),
        }),
      ),
    };
    return { repo: new ServiceAreaRepository(prisma as never), prisma };
  };

  it('listForCompany y findById', async () => {
    const { repo, prisma } = makeRepo();
    await repo.listForCompany('co-1');
    expect(prisma.serviceArea.findMany).toHaveBeenCalledWith({
      where: { companyId: 'co-1' },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    await repo.findById('sa-1');
    expect(prisma.serviceArea.findFirst).toHaveBeenCalledWith({
      where: { id: 'sa-1' },
    });
  });

  it('countForProfessional y countForCompany', async () => {
    const { repo, prisma } = makeRepo();
    prisma.serviceArea.count.mockResolvedValue(2);
    await repo.countForProfessional('pp-1');
    await repo.countForCompany('co-1');
    expect(prisma.serviceArea.count).toHaveBeenCalledTimes(2);
  });

  it('createForProfessional sin primary no desmarca', async () => {
    const txUpdateMany = vi.fn();
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: txUpdateMany },
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'sa-1' }]),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.createForProfessional({
      professionalProfileId: 'pp-1',
      label: 'Z',
      latitude: -34,
      longitude: -56,
      radiusMeters: 5000,
      isPrimary: false,
    });
    expect(txUpdateMany).not.toHaveBeenCalled();
  });

  it('listForProfessional ordena por primary', async () => {
    const { repo, prisma } = makeRepo();
    await repo.listForProfessional('pp-1');
    expect(prisma.serviceArea.findMany).toHaveBeenCalledWith({
      where: { professionalProfileId: 'pp-1' },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  });

  it('getCoordinates devuelve lat/lng', async () => {
    const { repo, prisma } = makeRepo();
    prisma.$queryRawUnsafe.mockResolvedValue([
      { latitude: -34.9, longitude: -56.16 },
    ]);
    const coords = await repo.getCoordinates('sa-1');
    expect(coords).toEqual({ latitude: -34.9, longitude: -56.16 });
  });

  it('getCoordinates null si no hay fila', async () => {
    const { repo, prisma } = makeRepo();
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    await expect(repo.getCoordinates('missing')).resolves.toBeNull();
  });

  it('createForProfessional inserta con PostGIS', async () => {
    const { repo, prisma } = makeRepo();
    const area = await repo.createForProfessional({
      professionalProfileId: 'pp-1',
      label: 'Zona',
      latitude: -34,
      longitude: -56,
      radiusMeters: 5000,
      isPrimary: true,
    });
    expect(area.label).toBe('Nueva');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('unsetPrimaryForProfessional desmarca zonas previas', async () => {
    const updateMany = vi.fn();
    const repo = new ServiceAreaRepository({} as never);
    await (
      repo as unknown as {
        unsetPrimaryForProfessional: (
          tx: { serviceArea: { updateMany: typeof updateMany } },
          id: string,
        ) => Promise<void>;
      }
    ).unsetPrimaryForProfessional({ serviceArea: { updateMany } }, 'pp-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { professionalProfileId: 'pp-1' },
      data: { isPrimary: false },
    });
  });

  it('unsetPrimaryForCompany desmarca zonas previas', async () => {
    const updateMany = vi.fn();
    const repo = new ServiceAreaRepository({} as never);
    await (
      repo as unknown as {
        unsetPrimaryForCompany: (
          tx: { serviceArea: { updateMany: typeof updateMany } },
          id: string,
        ) => Promise<void>;
      }
    ).unsetPrimaryForCompany({ serviceArea: { updateMany } }, 'co-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { companyId: 'co-1' },
      data: { isPrimary: false },
    });
  });

  it('createForCompany con isPrimary invoca unsetPrimaryForCompany', async () => {
    const tx = {
      serviceArea: { updateMany: vi.fn() },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'sa-co' }]),
    };
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    const spy = vi.spyOn(
      repo as unknown as { unsetPrimaryForCompany: typeof vi.fn },
      'unsetPrimaryForCompany',
    );
    await repo.createForCompany({
      companyId: 'co-1',
      label: 'HQ',
      latitude: -34,
      longitude: -56,
      radiusMeters: 5000,
      isPrimary: true,
    });
    expect(spy).toHaveBeenCalledWith(tx, 'co-1');
    spy.mockRestore();
  });

  it('createForCompany con primary desmarca otras', async () => {
    const txUpdateMany = vi.fn();
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: txUpdateMany },
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'sa-co' }]),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.createForCompany({
      companyId: 'co-1',
      label: 'Empresa',
      latitude: -34,
      longitude: -56,
      radiusMeters: 10_000,
      isPrimary: true,
    });
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { companyId: 'co-1' },
      data: { isPrimary: false },
    });
  });

  it('createForProfessional con primary desmarca otras', async () => {
    const txUpdateMany = vi.fn();
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: txUpdateMany },
          $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'sa-pp' }]),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.createForProfessional({
      professionalProfileId: 'pp-1',
      label: 'P',
      latitude: -34,
      longitude: -56,
      radiusMeters: 5000,
      isPrimary: true,
    });
    expect(txUpdateMany).toHaveBeenCalled();
  });

  it('update patch radius e isPrimary', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: vi.fn(), update: txUpdate },
          $executeRawUnsafe: vi.fn(),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', {
      radiusMeters: 7000,
      isPrimary: false,
      addressLine: 'Calle 1',
    });
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'sa-1' },
      data: {
        radiusMeters: 7000,
        isPrimary: false,
        addressLine: 'Calle 1',
      },
    });
  });

  it('update patch countryId stateId y cityId', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: vi.fn(), update: txUpdate },
          $executeRawUnsafe: vi.fn(),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', {
      countryId: 'c1',
      stateId: 's1',
      cityId: 'ci1',
    });
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'sa-1' },
      data: { countryId: 'c1', stateId: 's1', cityId: 'ci1' },
    });
  });

  it('update patch neighborhoodId', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: vi.fn(), update: txUpdate },
          $executeRawUnsafe: vi.fn(),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', { neighborhoodId: 'nb-1' });
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: 'sa-1' },
      data: { neighborhoodId: 'nb-1' },
    });
  });

  it('update solo campos sin coordenadas', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const txExecute = vi.fn();
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: vi.fn(), update: txUpdate },
          $executeRawUnsafe: txExecute,
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', { label: 'Solo label' });
    expect(txUpdate).toHaveBeenCalled();
    expect(txExecute).not.toHaveBeenCalled();
  });

  it('update desmarca primary de empresa', async () => {
    const txUpdateMany = vi.fn();
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: txUpdateMany, update: txUpdate },
          $executeRawUnsafe: vi.fn(),
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', {
      isPrimary: true,
      clearPrimaryOnSubject: { companyId: 'co-1' },
    });
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { companyId: 'co-1' },
      data: { isPrimary: false },
    });
  });

  it('update con coordenadas ejecuta raw', async () => {
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sa-1' });
    const txExecute = vi.fn();
    const prisma = {
      serviceArea: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          serviceArea: { updateMany: vi.fn(), update: txUpdate },
          $executeRawUnsafe: txExecute,
        }),
      ),
    };
    const repo = new ServiceAreaRepository(prisma as never);
    await repo.update('sa-1', {
      latitude: -34,
      longitude: -56,
      isPrimary: true,
      clearPrimaryOnSubject: { professionalProfileId: 'pp-1' },
    });
    expect(txExecute).toHaveBeenCalled();
  });

  it('delete elimina por id', async () => {
    const { repo, prisma } = makeRepo();
    prisma.serviceArea.delete.mockResolvedValue({});
    await repo.delete('sa-1');
    expect(prisma.serviceArea.delete).toHaveBeenCalledWith({
      where: { id: 'sa-1' },
    });
  });
});
