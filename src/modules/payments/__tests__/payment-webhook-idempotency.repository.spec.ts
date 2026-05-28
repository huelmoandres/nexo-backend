import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentWebhookIdempotencyStatus } from '@prisma/client';
import { PaymentWebhookIdempotencyRepository } from '../payment-webhook-idempotency.repository';

describe('PaymentWebhookIdempotencyRepository', () => {
  const prisma = {
    paymentWebhookIdempotency: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const repo = new PaymentWebhookIdempotencyRepository(prisma as never);

  beforeEach(() => vi.clearAllMocks());

  it('begin retorna completed si ya procesado', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValue({
      status: PaymentWebhookIdempotencyStatus.COMPLETED,
    });
    const r = await repo.begin({
      idempotencyKey: 'k1',
      provider: 'mercadopago',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('completed');
    expect(prisma.paymentWebhookIdempotency.create).not.toHaveBeenCalled();
  });

  it('begin crea fila PROCESSING', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValue(null);
    prisma.paymentWebhookIdempotency.create.mockResolvedValue({});
    const r = await repo.begin({
      idempotencyKey: 'k1',
      provider: 'mock',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('new');
  });

  it('begin retorna in_progress si existe PROCESSING no stale', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValue({
      status: PaymentWebhookIdempotencyStatus.PROCESSING,
      createdAt: new Date(),
    });
    const r = await repo.begin({
      idempotencyKey: 'k2',
      provider: 'mercadopago',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('in_progress');
    expect(prisma.paymentWebhookIdempotency.delete).not.toHaveBeenCalled();
  });

  it('begin borra PROCESSING stale y recrea', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValue({
      status: PaymentWebhookIdempotencyStatus.PROCESSING,
      createdAt: new Date(Date.now() - 120_000),
    });
    prisma.paymentWebhookIdempotency.create.mockResolvedValue({});
    const r = await repo.begin({
      idempotencyKey: 'k3',
      provider: 'mock',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('new');
    expect(prisma.paymentWebhookIdempotency.delete).toHaveBeenCalledWith({
      where: { idempotencyKey: 'k3' },
    });
  });

  it('begin borra estado previo no processing/completed y recrea', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValue({
      status: PaymentWebhookIdempotencyStatus.FAILED,
      createdAt: new Date(),
    });
    prisma.paymentWebhookIdempotency.create.mockResolvedValue({});
    const r = await repo.begin({
      idempotencyKey: 'k4',
      provider: 'mock',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('new');
    expect(prisma.paymentWebhookIdempotency.delete).toHaveBeenCalledWith({
      where: { idempotencyKey: 'k4' },
    });
  });

  it('begin reintenta cuando create falla por unique violation', async () => {
    prisma.paymentWebhookIdempotency.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: PaymentWebhookIdempotencyStatus.COMPLETED,
      });
    prisma.paymentWebhookIdempotency.create.mockRejectedValueOnce({
      code: 'P2002',
    });
    const r = await repo.begin({
      idempotencyKey: 'k5',
      provider: 'mock',
      operation: 'op',
      staleProcessingMs: 60_000,
    });
    expect(r).toBe('completed');
  });

  it('begin propaga error si create falla por causa no-unique', async () => {
    prisma.paymentWebhookIdempotency.findUnique.mockResolvedValueOnce(null);
    prisma.paymentWebhookIdempotency.create.mockRejectedValueOnce(
      new Error('db-down'),
    );
    await expect(
      repo.begin({
        idempotencyKey: 'k6x',
        provider: 'mock',
        operation: 'op',
        staleProcessingMs: 60_000,
      }),
    ).rejects.toThrow('db-down');
  });

  it('complete guarda outcomeSummary cuando existe', async () => {
    await repo.complete('k6', { ok: true });
    expect(prisma.paymentWebhookIdempotency.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'k6' },
        data: expect.objectContaining({
          status: PaymentWebhookIdempotencyStatus.COMPLETED,
          outcomeSummary: { ok: true },
        }),
      }),
    );
  });

  it('complete sin outcomeSummary no lo incluye en update', async () => {
    await repo.complete('k6b');
    expect(prisma.paymentWebhookIdempotency.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'k6b' },
        data: expect.not.objectContaining({
          outcomeSummary: expect.anything(),
        }),
      }),
    );
  });

  it('abandon borra solo processing', async () => {
    await repo.abandon('k7');
    expect(prisma.paymentWebhookIdempotency.deleteMany).toHaveBeenCalledWith({
      where: {
        idempotencyKey: 'k7',
        status: PaymentWebhookIdempotencyStatus.PROCESSING,
      },
    });
  });
});
