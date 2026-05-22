import { describe, expect, it, vi } from 'vitest';
import { BILLING_DUNNING_JOB } from '../billing.constants';
import { SubscriptionDunningProcessor } from '../subscription-dunning.processor';

describe('SubscriptionDunningProcessor', () => {
  it('runs dunning job', async () => {
    const billingService = {
      processDunningJob: vi.fn().mockResolvedValue(undefined),
    };
    const processor = new SubscriptionDunningProcessor(billingService as never);
    await processor.process({ name: BILLING_DUNNING_JOB } as never);
    expect(billingService.processDunningJob).toHaveBeenCalled();
  });

  it('rethrows when dunning fails', async () => {
    const billingService = {
      processDunningJob: vi.fn().mockRejectedValue(new Error('fail')),
    };
    const processor = new SubscriptionDunningProcessor(billingService as never);
    await expect(
      processor.process({ name: BILLING_DUNNING_JOB } as never),
    ).rejects.toThrow('fail');
  });

  it('wraps non-Error rejections', async () => {
    const billingService = {
      processDunningJob: vi.fn().mockRejectedValue('boom'),
    };
    const processor = new SubscriptionDunningProcessor(billingService as never);
    await expect(
      processor.process({ name: BILLING_DUNNING_JOB } as never),
    ).rejects.toThrow('boom');
  });

  it('ignores unknown job names', async () => {
    const billingService = { processDunningJob: vi.fn() };
    const processor = new SubscriptionDunningProcessor(billingService as never);
    await processor.process({ name: 'other' } as never);
    expect(billingService.processDunningJob).not.toHaveBeenCalled();
  });
});
