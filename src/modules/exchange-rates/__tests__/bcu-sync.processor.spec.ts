import { describe, expect, it, vi } from 'vitest';
import {
  BCU_EXCHANGE_RATES_QUEUE,
  BCU_EXCHANGE_RATES_SYNC_JOB,
} from '../exchange-rates.constants';
import { BcuSyncProcessor } from '../bcu-sync.processor';

describe('BcuSyncProcessor', () => {
  const exchangeRatesService = { syncFromBcu: vi.fn().mockResolvedValue(2) };
  const auditContext = {
    ensureWorkerContext: vi.fn().mockReturnValue({ correlationId: 'corr' }),
    getCorrelationId: vi.fn().mockReturnValue('corr'),
  };
  const processAudit = { record: vi.fn().mockResolvedValue(undefined) };
  const proc = new BcuSyncProcessor(
    exchangeRatesService as never,
    auditContext as never,
    processAudit as never,
  );

  it('ignora jobs desconocidos', async () => {
    await proc.process({ name: 'other' } as never);
    expect(exchangeRatesService.syncFromBcu).not.toHaveBeenCalled();
  });

  it('sincroniza BCU', async () => {
    await proc.process({
      name: BCU_EXCHANGE_RATES_SYNC_JOB,
      queueName: BCU_EXCHANGE_RATES_QUEUE,
    } as never);
    expect(exchangeRatesService.syncFromBcu).toHaveBeenCalled();
  });

  it('relanza error string', async () => {
    exchangeRatesService.syncFromBcu.mockRejectedValueOnce('fail-string');
    await expect(
      proc.process({ name: BCU_EXCHANGE_RATES_SYNC_JOB } as never),
    ).rejects.toThrow('fail-string');
  });

  it('relanza error', async () => {
    exchangeRatesService.syncFromBcu.mockRejectedValueOnce(new Error('fail'));
    await expect(
      proc.process({ name: BCU_EXCHANGE_RATES_SYNC_JOB } as never),
    ).rejects.toThrow();
  });
});
