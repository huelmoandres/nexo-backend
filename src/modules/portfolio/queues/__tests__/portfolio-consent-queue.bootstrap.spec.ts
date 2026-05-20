import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORTFOLIO_CONSENT_EXPIRE_CRON_JOB } from '../../portfolio.constants';
import { PortfolioConsentQueueBootstrap } from '../portfolio-consent-queue.bootstrap';

describe('PortfolioConsentQueueBootstrap', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registra job repetible al iniciar', async () => {
    const consentQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const bootstrap = new PortfolioConsentQueueBootstrap(consentQueue as never);
    await bootstrap.onModuleInit();
    expect(consentQueue.add).toHaveBeenCalledWith(
      PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
      {},
      expect.objectContaining({ jobId: 'portfolio-consent-expire-hourly' }),
    );
  });

  it('loguea warning si add falla', async () => {
    const consentQueue = {
      add: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const bootstrap = new PortfolioConsentQueueBootstrap(consentQueue as never);
    await bootstrap.onModuleInit();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('normaliza errores no-Error al registrar cron', async () => {
    const consentQueue = {
      add: vi.fn().mockRejectedValue('redis string failure'),
    };
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const bootstrap = new PortfolioConsentQueueBootstrap(consentQueue as never);
    await bootstrap.onModuleInit();
    expect(warnSpy).toHaveBeenCalled();
  });
});
