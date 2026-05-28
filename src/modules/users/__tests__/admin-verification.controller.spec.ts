import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { VerificationSubjectType } from '@prisma/client';
import { AdminVerificationController } from '../admin-verification.controller';

describe('AdminVerificationController', () => {
  it('getDocumentUrl delega al service', async () => {
    const dgi = {
      getAdminVerificationDocumentUrl: vi.fn().mockResolvedValue({
        viewUrl: 'https://signed',
        expiresInSeconds: 900,
      }),
    };
    const repo = { findBySupabaseUidForMe: vi.fn() };
    const controller = new AdminVerificationController(
      dgi as never,
      repo as never,
    );

    const res = await controller.getDocumentUrl(
      VerificationSubjectType.PROFESSIONAL,
      'p1',
    );

    expect(dgi.getAdminVerificationDocumentUrl).toHaveBeenCalledWith(
      VerificationSubjectType.PROFESSIONAL,
      'p1',
    );
    expect(res.viewUrl).toBe('https://signed');
  });

  it('listPending delega al service', async () => {
    const dgi = {
      listPendingForAdmin: vi.fn().mockResolvedValue([]),
    };
    const repo = { findBySupabaseUidForMe: vi.fn() };
    const controller = new AdminVerificationController(
      dgi as never,
      repo as never,
    );

    await controller.listPending();

    expect(dgi.listPendingForAdmin).toHaveBeenCalled();
  });

  it('review resuelve reviewer y delega adminReview', async () => {
    const dgi = {
      adminReview: vi.fn().mockResolvedValue({ status: 'VERIFIED_AUTO' }),
    };
    const repo = {
      findBySupabaseUidForMe: vi.fn().mockResolvedValue({ id: 'admin-1' }),
    };
    const controller = new AdminVerificationController(
      dgi as never,
      repo as never,
    );

    await controller.review(
      { sub: 'admin-sub' },
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'APPROVE' },
    );

    expect(dgi.adminReview).toHaveBeenCalledWith(
      VerificationSubjectType.COMPANY,
      'c1',
      { action: 'APPROVE' },
      'admin-1',
    );
  });

  it('review lanza USER_NOT_FOUND si admin no está sincronizado', async () => {
    const dgi = { adminReview: vi.fn() };
    const repo = { findBySupabaseUidForMe: vi.fn().mockResolvedValue(null) };
    const controller = new AdminVerificationController(
      dgi as never,
      repo as never,
    );

    await expect(
      controller.review(
        { sub: 'ghost' },
        VerificationSubjectType.COMPANY,
        'c1',
        { action: 'REJECT', reason: 'x' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
