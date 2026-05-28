import { describe, expect, it, vi } from 'vitest';
import { AdminEscrowPayoutController } from '../admin-escrow-payout.controller';

describe('AdminEscrowPayoutController', () => {
  const escrowPayout = {
    listPendingManualPayouts: vi.fn().mockResolvedValue({ items: [] }),
    presignManualPayoutReceipt: vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'u', receiptStorageKey: 'k' }),
    confirmManualPayout: vi
      .fn()
      .mockResolvedValue({ payoutStatus: 'SUCCEEDED' }),
  };
  const ctrl = new AdminEscrowPayoutController(escrowPayout as never);

  it('delega listado pendientes', async () => {
    await ctrl.listPending({ page: 1, limit: 10 } as never);
    expect(escrowPayout.listPendingManualPayouts).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });

  it('delega presign de comprobante', async () => {
    await ctrl.presignReceipt('job-1', {
      contentType: 'application/pdf',
    } as never);
    expect(escrowPayout.presignManualPayoutReceipt).toHaveBeenCalledWith(
      'job-1',
      expect.any(Object),
    );
  });

  it('delega confirmación manual', async () => {
    await ctrl.confirm({ sub: 'admin-1' } as never, 'job-1', {
      receiptStorageKey: 'k',
    } as never);
    expect(escrowPayout.confirmManualPayout).toHaveBeenCalledWith(
      'job-1',
      'admin-1',
      { receiptStorageKey: 'k' },
    );
  });
});
