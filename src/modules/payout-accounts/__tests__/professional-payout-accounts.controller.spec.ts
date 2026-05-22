import { describe, expect, it, vi } from 'vitest';
import { ProfessionalPayoutAccountsController } from '../professional-payout-accounts.controller';

describe('ProfessionalPayoutAccountsController', () => {
  const service = {
    listForCurrentProfessional: vi.fn().mockResolvedValue([]),
    createForCurrentProfessional: vi.fn(),
    updateForCurrentProfessional: vi.fn(),
    setPrimaryForCurrentProfessional: vi.fn(),
    deactivateForCurrentProfessional: vi.fn(),
  };

  const ctrl = new ProfessionalPayoutAccountsController(service as never);

  it('delega al service', async () => {
    await ctrl.list({ sub: 'uid' } as never);
    await ctrl.create({ sub: 'uid' } as never, {} as never);
    await ctrl.update({ sub: 'uid' } as never, 'acc-1', {} as never);
    await ctrl.setPrimary({ sub: 'uid' } as never, 'acc-1');
    await ctrl.deactivate({ sub: 'uid' } as never, 'acc-1');
    expect(service.listForCurrentProfessional).toHaveBeenCalledWith('uid');
  });
});
