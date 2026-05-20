import { describe, expect, it, vi } from 'vitest';
import { Job } from 'bullmq';
import { portfolioConfig } from '@config/portfolio.config';
import { NotificationsService } from '@modules/notifications/notifications.service';
import {
  PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
  PORTFOLIO_CONSENT_REMINDER_JOB,
} from '../portfolio.constants';
import { PortfolioConsentQueueProcessor } from '../queues/portfolio-consent-queue.processor';
import { PortfolioRepository } from '../portfolio.repository';

type ConsentReminderJobData = { consentId?: string } | Record<string, never>;

describe('PortfolioConsentQueueProcessor', () => {
  const cfg = {
    reminderZombieReclaimMs: 300_000,
  } as ReturnType<typeof portfolioConfig>;

  it('expire job llama expirePendingPortfolioConsents', async () => {
    const expirePendingPortfolioConsents = vi.fn().mockResolvedValue(2);
    const repository = {
      expirePendingPortfolioConsents,
    } as unknown as PortfolioRepository;
    const notifications = {} as NotificationsService;
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      notifications,
      cfg,
    );
    await proc.process({
      name: PORTFOLIO_CONSENT_EXPIRE_CRON_JOB,
      data: {},
    } as Job<ConsentReminderJobData>);
    expect(expirePendingPortfolioConsents).toHaveBeenCalledTimes(1);
  });

  it('reminder job: claim fallido no notifica', async () => {
    const claimConsentReminderAttempt = vi.fn().mockResolvedValue(false);
    const findConsentReminderPayload = vi.fn();
    const markConsentReminderSent = vi.fn();
    const expirePendingPortfolioConsents = vi.fn();
    const repository = {
      claimConsentReminderAttempt,
      findConsentReminderPayload,
      markConsentReminderSent,
      expirePendingPortfolioConsents,
    } as unknown as PortfolioRepository;
    const notifyPortfolioConsentReminder = vi.fn();
    const notifications = {
      notifyPortfolioConsentReminder,
    } as unknown as NotificationsService;
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      notifications,
      cfg,
    );
    await proc.process({
      name: PORTFOLIO_CONSENT_REMINDER_JOB,
      data: { consentId: 'c1' },
    } as Job<ConsentReminderJobData>);
    expect(notifyPortfolioConsentReminder).not.toHaveBeenCalled();
  });

  it('reminder job: claim ok y payload ok notifica y marca enviado', async () => {
    const claimConsentReminderAttempt = vi.fn().mockResolvedValue(true);
    const findConsentReminderPayload = vi.fn().mockResolvedValue({
      clientUserId: 'u1',
      portfolioItemId: 'item-1',
      jobTitle: 'J',
    });
    const markConsentReminderSent = vi.fn().mockResolvedValue(undefined);
    const expirePendingPortfolioConsents = vi.fn();
    const repository = {
      claimConsentReminderAttempt,
      findConsentReminderPayload,
      markConsentReminderSent,
      expirePendingPortfolioConsents,
    } as unknown as PortfolioRepository;
    const notifyPortfolioConsentReminder = vi.fn().mockResolvedValue(undefined);
    const notifications = {
      notifyPortfolioConsentReminder,
    } as unknown as NotificationsService;
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      notifications,
      cfg,
    );
    await proc.process({
      name: PORTFOLIO_CONSENT_REMINDER_JOB,
      data: { consentId: 'c1' },
    } as Job<ConsentReminderJobData>);
    expect(notifyPortfolioConsentReminder).toHaveBeenCalledWith({
      clientUserId: 'u1',
      jobTitle: 'J',
      portfolioItemId: 'item-1',
    });
    expect(markConsentReminderSent).toHaveBeenCalledWith('c1');
  });

  it('ignora jobs desconocidos', async () => {
    const repository = {
      expirePendingPortfolioConsents: vi.fn(),
    } as unknown as PortfolioRepository;
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      {} as NotificationsService,
      cfg,
    );
    await proc.process({
      name: 'unknown',
      data: {},
    } as Job<ConsentReminderJobData>);
    expect(repository.expirePendingPortfolioConsents).not.toHaveBeenCalled();
  });

  it('reminder sin consentId no notifica', async () => {
    const notifyPortfolioConsentReminder = vi.fn();
    const repository = {
      claimConsentReminderAttempt: vi.fn(),
    } as unknown as PortfolioRepository;
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      { notifyPortfolioConsentReminder } as unknown as NotificationsService,
      cfg,
    );
    await proc.process({
      name: PORTFOLIO_CONSENT_REMINDER_JOB,
      data: {},
    } as Job<ConsentReminderJobData>);
    expect(notifyPortfolioConsentReminder).not.toHaveBeenCalled();
  });

  it('reminder sin payload marca skip', async () => {
    const repository = {
      claimConsentReminderAttempt: vi.fn().mockResolvedValue(true),
      findConsentReminderPayload: vi.fn().mockResolvedValue(null),
    } as unknown as PortfolioRepository;
    const notifyPortfolioConsentReminder = vi.fn();
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      { notifyPortfolioConsentReminder } as unknown as NotificationsService,
      cfg,
    );
    await proc.process({
      name: PORTFOLIO_CONSENT_REMINDER_JOB,
      data: { consentId: 'c1' },
    } as Job<ConsentReminderJobData>);
    expect(notifyPortfolioConsentReminder).not.toHaveBeenCalled();
  });

  it('reminder captura error de notificación sin relanzar', async () => {
    const repository = {
      claimConsentReminderAttempt: vi.fn().mockResolvedValue(true),
      findConsentReminderPayload: vi.fn().mockResolvedValue({
        clientUserId: 'u1',
        portfolioItemId: 'item-1',
        jobTitle: 'J',
      }),
      markConsentReminderSent: vi.fn(),
    } as unknown as PortfolioRepository;
    const notifyPortfolioConsentReminder = vi
      .fn()
      .mockRejectedValue('smtp-down');
    const proc = new PortfolioConsentQueueProcessor(
      repository,
      { notifyPortfolioConsentReminder } as unknown as NotificationsService,
      cfg,
    );
    await expect(
      proc.process({
        name: PORTFOLIO_CONSENT_REMINDER_JOB,
        data: { consentId: 'c1' },
      } as Job<ConsentReminderJobData>),
    ).resolves.toBeUndefined();
    expect(repository.markConsentReminderSent).not.toHaveBeenCalled();
  });
});
