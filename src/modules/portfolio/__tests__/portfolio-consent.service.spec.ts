import { GoneException, NotFoundException } from '@nestjs/common';
import { ConsentDeclineReason, ConsentStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioConsentService } from '../services/portfolio-consent.service';

describe('PortfolioConsentService', () => {
  const make = () => {
    const repository = {
      findConsentPreviewByToken: vi.fn(),
      acceptPortfolioConsent: vi.fn(),
      declinePortfolioConsent: vi.fn(),
    };
    const notifications = {
      notifyProfessionalConsentAccepted: vi.fn().mockResolvedValue(undefined),
      notifyProfessionalConsentDeclined: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new PortfolioConsentService(
      repository as never,
      notifications as never,
    );
    return { svc, repository, notifications };
  };

  const baseRow = {
    status: ConsentStatus.PENDING,
    expiresAt: new Date(Date.now() + 86_400_000),
    portfolioItem: {
      title: 'Obra',
      description: 'Desc',
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Plomería' },
      professional: { user: { fullName: 'Juan Pérez' } },
      photos: [],
      job: {
        id: 'job-1',
        title: 'Job',
        completedAt: new Date(),
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Plomería' },
      },
    },
  };

  it('getConsentPreview lanza 404 si token no existe', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue(null);
    await expect(svc.getConsentPreview('token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getConsentPreview lanza 410 si ya resuelto', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      status: ConsentStatus.ACCEPTED,
    });
    await expect(svc.getConsentPreview('token')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('getConsentPreview lanza 410 si expiró', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(svc.getConsentPreview('token')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('getConsentPreview lanza 404 si job ausente', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: { ...baseRow.portfolioItem, job: null },
    });
    await expect(svc.getConsentPreview('token')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('getConsentPreview formatea nombre y devuelve DTO', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: {
        ...baseRow.portfolioItem,
        photos: [
          {
            id: 'ph-1',
            fileKey: 'k.jpg',
            caption: 'antes',
            displayOrder: 1,
          },
        ],
      },
    });
    const result = await svc.getConsentPreview('token');
    expect(result.professionalDisplayName).toBe('Juan P.');
    expect(result.categoryCoincide).toBe(true);
    expect(result.photos).toHaveLength(1);
  });

  it('getConsentPreview con un solo nombre no agrega inicial', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: {
        ...baseRow.portfolioItem,
        professional: { user: { fullName: 'Ana' } },
      },
    });
    const result = await svc.getConsentPreview('token');
    expect(result.professionalDisplayName).toBe('Ana');
  });

  it('getConsentPreview marca categoryCoincide false si categorías difieren', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: {
        ...baseRow.portfolioItem,
        categoryId: 'cat-item',
        job: {
          ...baseRow.portfolioItem.job,
          categoryId: 'cat-job',
        },
      },
    });
    const result = await svc.getConsentPreview('token');
    expect(result.categoryCoincide).toBe(false);
  });

  it('getConsentPreview usa Profesional si nombre vacío', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: {
        ...baseRow.portfolioItem,
        professional: { user: { fullName: '   ' } },
      },
    });
    const result = await svc.getConsentPreview('token');
    expect(result.professionalDisplayName).toBe('Profesional');
  });

  it('getConsentPreview tolera fullName ausente en el usuario', async () => {
    const { svc, repository } = make();
    repository.findConsentPreviewByToken.mockResolvedValue({
      ...baseRow,
      portfolioItem: {
        ...baseRow.portfolioItem,
        professional: { user: { fullName: null } },
      },
    });
    const result = await svc.getConsentPreview('token');
    expect(result.professionalDisplayName).toBe('Profesional');
  });

  it('acceptConsent notifica al profesional', async () => {
    const { svc, repository, notifications } = make();
    repository.acceptPortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
    });
    await svc.acceptConsent('token');
    expect(notifications.notifyProfessionalConsentAccepted).toHaveBeenCalled();
  });

  it('acceptConsent no lanza si notificación falla', async () => {
    const { svc, repository, notifications } = make();
    repository.acceptPortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
    });
    notifications.notifyProfessionalConsentAccepted.mockRejectedValue(
      'notify-string-failure',
    );
    await expect(svc.acceptConsent('token')).resolves.toBeUndefined();
  });

  it('declineConsent notifica al profesional', async () => {
    const { svc, repository, notifications } = make();
    repository.declinePortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: ConsentDeclineReason.INAPPROPRIATE,
    });
    await svc.declineConsent('token', {
      reason: ConsentDeclineReason.INAPPROPRIATE,
    });
    expect(notifications.notifyProfessionalConsentDeclined).toHaveBeenCalled();
  });

  it('declineConsent pasa meta opcional al repositorio', async () => {
    const { svc, repository } = make();
    repository.declinePortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: ConsentDeclineReason.PRIVACY,
    });
    await svc.declineConsent(
      'token',
      { reason: ConsentDeclineReason.PRIVACY, notes: 'n' },
      { ipAddress: '10.0.0.1', userAgent: 'Vitest' },
    );
    expect(repository.declinePortfolioConsent).toHaveBeenCalledWith('token', {
      reason: ConsentDeclineReason.PRIVACY,
      notes: 'n',
      ipAddress: '10.0.0.1',
      userAgent: 'Vitest',
    });
  });

  it('acceptConsent no lanza si notificación falla con Error', async () => {
    const { svc, repository, notifications } = make();
    repository.acceptPortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
    });
    notifications.notifyProfessionalConsentAccepted.mockRejectedValue(
      new Error('notify fail'),
    );
    await expect(svc.acceptConsent('token')).resolves.toBeUndefined();
  });

  it('declineConsent no lanza si notificación falla con error no-Error', async () => {
    const { svc, repository, notifications } = make();
    repository.declinePortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: ConsentDeclineReason.OTHER,
    });
    notifications.notifyProfessionalConsentDeclined.mockRejectedValue(
      'notify-string-failure',
    );
    await expect(
      svc.declineConsent('token', { reason: ConsentDeclineReason.OTHER }),
    ).resolves.toBeUndefined();
  });

  it('declineConsent no lanza si notificación falla con Error', async () => {
    const { svc, repository, notifications } = make();
    repository.declinePortfolioConsent.mockResolvedValue({
      professionalUserId: 'pro-user',
      portfolioItemId: 'item-1',
      jobId: 'job-1',
      reason: ConsentDeclineReason.OTHER,
    });
    notifications.notifyProfessionalConsentDeclined.mockRejectedValue(
      new Error('notify fail'),
    );
    await expect(
      svc.declineConsent('token', { reason: ConsentDeclineReason.OTHER }),
    ).resolves.toBeUndefined();
  });
});
