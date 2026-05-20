import { describe, expect, it, vi } from 'vitest';
import {
  PORTFOLIO_CLEANUP_JOB,
  PortfolioCleanupProcessor,
} from '../queues/portfolio-cleanup.processor';

describe('PortfolioCleanupProcessor', () => {
  const makeProcessor = () => {
    const storage = {
      deleteObjectAsSystem: vi.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      portfolioPhoto: {
        findMany: vi.fn(),
      },
    };
    const processor = new PortfolioCleanupProcessor(
      storage as never,
      prisma as never,
    );
    return { processor, storage, prisma };
  };

  it('ignora jobs con nombre distinto', async () => {
    const { processor, prisma } = makeProcessor();
    await processor.process({
      name: 'other-job',
      data: { itemId: 'item-1', professionalId: 'prof-1' },
    } as never);
    expect(prisma.portfolioPhoto.findMany).not.toHaveBeenCalled();
  });

  it('borra cada foto con deleteObjectAsSystem', async () => {
    const { processor, storage, prisma } = makeProcessor();
    prisma.portfolioPhoto.findMany.mockResolvedValue([
      { fileKey: 'users/prof-1/portfolio/item-1/a.webp' },
      { fileKey: 'users/prof-1/portfolio/item-1/b.webp' },
    ]);

    await processor.process({
      name: PORTFOLIO_CLEANUP_JOB,
      data: { itemId: 'item-1', professionalId: 'prof-1' },
    } as never);

    expect(storage.deleteObjectAsSystem).toHaveBeenCalledTimes(2);
    expect(storage.deleteObjectAsSystem).toHaveBeenCalledWith(
      'users/prof-1/portfolio/item-1/a.webp',
      undefined,
      'portfolio-cleanup:item=item-1',
    );
  });

  it('continúa si deleteObjectAsSystem falla con error no-Error', async () => {
    const { processor, storage, prisma } = makeProcessor();
    prisma.portfolioPhoto.findMany.mockResolvedValue([{ fileKey: 'key-a' }]);
    storage.deleteObjectAsSystem.mockRejectedValueOnce('r2-string-error');
    await processor.process({
      name: PORTFOLIO_CLEANUP_JOB,
      data: { itemId: 'item-1', professionalId: 'prof-1' },
    } as never);
    expect(storage.deleteObjectAsSystem).toHaveBeenCalled();
  });

  it('continúa si deleteObjectAsSystem falla para una foto', async () => {
    const { processor, storage, prisma } = makeProcessor();
    prisma.portfolioPhoto.findMany.mockResolvedValue([
      { fileKey: 'key-a' },
      { fileKey: 'key-b' },
    ]);
    storage.deleteObjectAsSystem
      .mockRejectedValueOnce(new Error('r2 error'))
      .mockResolvedValueOnce(undefined);

    await processor.process({
      name: PORTFOLIO_CLEANUP_JOB,
      data: { itemId: 'item-1', professionalId: 'prof-1' },
    } as never);

    expect(storage.deleteObjectAsSystem).toHaveBeenCalledTimes(2);
  });
});
