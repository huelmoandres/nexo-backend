import { describe, expect, it, vi } from 'vitest';
import { CompanyPayoutAccountsController } from '../company-payout-accounts.controller';

describe('CompanyPayoutAccountsController', () => {
  const service = {
    listForCompany: vi.fn().mockResolvedValue([]),
    createForCompany: vi.fn(),
    setPrimaryForCompany: vi.fn(),
  };
  const ctrl = new CompanyPayoutAccountsController(service as never);

  it('delegates', async () => {
    await ctrl.list({ sub: 'u' } as never, 'co-1');
    await ctrl.create({ sub: 'u' } as never, 'co-1', {} as never);
    await ctrl.setPrimary({ sub: 'u' } as never, 'co-1', 'acc-1');
    expect(service.setPrimaryForCompany).toHaveBeenCalled();
  });
});
