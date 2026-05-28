import { describe, expect, it, vi } from 'vitest';
import {
  SILENT_ACCEPTANCE_JOB,
  SILENT_ACCEPTANCE_QUEUE,
} from '../escrow.constants';
import { SilentAcceptanceProcessor } from '../silent-acceptance.processor';

describe('SilentAcceptanceProcessor', () => {
  const escrowService = { processSilentAcceptance: vi.fn() };
  const auditContext = {
    ensureWorkerContext: vi.fn().mockReturnValue({ correlationId: 'corr' }),
    getCorrelationId: vi.fn().mockReturnValue('corr'),
  };
  const processAudit = { record: vi.fn().mockResolvedValue(undefined) };
  const proc = new SilentAcceptanceProcessor(
    escrowService as never,
    auditContext as never,
    processAudit as never,
  );

  it('ignora job desconocido', async () => {
    await proc.process({ name: 'other', data: { jobId: 'j1' } } as never);
    expect(escrowService.processSilentAcceptance).not.toHaveBeenCalled();
  });

  it('procesa silent acceptance', async () => {
    await proc.process({
      name: SILENT_ACCEPTANCE_JOB,
      queueName: SILENT_ACCEPTANCE_QUEUE,
      data: { jobId: 'job-1' },
    } as never);
    expect(escrowService.processSilentAcceptance).toHaveBeenCalledWith('job-1');
  });
});
