import { describe, expect, it, vi } from 'vitest';
import { PayoutBanksController } from '../payout-banks.controller';

describe('PayoutBanksController', () => {
  it('listBanks', async () => {
    const service = { listBanks: vi.fn().mockResolvedValue([]) };
    const ctrl = new PayoutBanksController(service as never);
    await ctrl.listBanks();
    expect(service.listBanks).toHaveBeenCalled();
  });
});
